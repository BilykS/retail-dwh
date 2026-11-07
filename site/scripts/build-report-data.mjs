#!/usr/bin/env node
/**
 * Rolls the warehouse up into public/data/report.json, the only data the report
 * page reads. It runs locally against the Docker database and the result is
 * committed, because the deploy has no access to the warehouse.
 *
 * Sales come from `star`, whose product dimension keeps history, so a sale counts
 * in the category the product had on that day, the same as in Power BI. Stock
 * comes from `dbt_star`, the only schema that has it.
 *
 * Grain: month x store x channel x category. Amounts are rounded to whole
 * hryvnias to keep the file small, which moves the totals by less than 200 UAH.
 *
 * Order counts are stored twice on purpose. An order belongs to exactly one
 * month, store and channel, so counts add up across those. It can contain
 * several categories, so per-category counts must not be added across
 * categories: `o` holds the counts without a category, and the last field of
 * `f` holds the counts within one.
 *
 * Run: node scripts/build-report-data.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './warehouse.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');

const sales = query(`
  select d.year * 100 + d.month, s.store_name, s.city_name, s.region, s.store_type, t.channel, p.category_parent,
         sum(f.net_amount), sum(f.cost_amount), sum(f.quantity), count(distinct f.order_number),
         coalesce(sum(f.net_amount) filter (where f.quantity > 0 and f.discount_amount > 0), 0),
         coalesce(sum(f.cost_amount) filter (where f.quantity > 0 and f.discount_amount > 0), 0),
         coalesce(sum(f.net_amount) filter (where f.quantity > 0 and f.discount_amount = 0), 0),
         coalesce(sum(f.cost_amount) filter (where f.quantity > 0 and f.discount_amount = 0), 0),
         coalesce(sum(f.discount_amount) filter (where f.quantity > 0), 0)
  from star.fact_sales f
  join star.dim_date d using (date_key)
  join star.dim_store s using (store_key)
  join star.dim_transaction_type t using (transaction_type_key)
  join star.dim_product p using (product_key)
  group by 1, 2, 3, 4, 5, 6, 7`);

const orders = query(`
  select d.year * 100 + d.month, s.store_name, t.channel, count(distinct f.order_number)
  from star.fact_sales f
  join star.dim_date d using (date_key)
  join star.dim_store s using (store_key)
  join star.dim_transaction_type t using (transaction_type_key)
  group by 1, 2, 3`);

const stock = query(`
  select d.full_date, w.warehouse_name, sum(i.qty_on_hand), sum(i.qty_reserved), sum(i.qty_in_transit), sum(i.qty_available)
  from dbt_star.fact_inventory i
  join dbt_star.dim_date d using (date_key)
  join dbt_star.dim_warehouse w using (warehouse_key)
  group by 1, 2 order by 1, 2`);

const low = query(`
  select p.sku, p.product_name, p.category_name, c.qty_stock, round(c.avg_per_day, 2), round(c.days_cover, 1)
  from dbt_star.stock_cover c
  join dbt_star.dim_product p using (product_key)
  where c.days_cover is not null and p.product_id <> -1
  order by c.days_cover limit 12`);

// The key is what the UI translates.
const cover = query(`
  select case when days_cover < 30 then 'lt30' when days_cover < 90 then 'd30' when days_cover < 180 then 'd90'
              when days_cover < 365 then 'd180' when days_cover < 730 then 'y1' when days_cover < 1095 then 'y2'
              when days_cover < 1825 then 'y3' else 'y5' end,
         count(*)
  from dbt_star.stock_cover where product_key <> md5('-1') group by 1`);
const COVER_ORDER = ['lt30', 'd30', 'd90', 'd180', 'y1', 'y2', 'y3', 'y5'];

const sorted = (values) => [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const indexOf = (list) => new Map(list.map((v, i) => [v, i]));

const months = sorted(sales.map((r) => Number(r[0])));
const storeNames = sorted(sales.map((r) => r[1]));
const channels = sorted(sales.map((r) => r[5]));
const cats = sorted(sales.map((r) => r[6]));
const wh = sorted(stock.map((r) => r[1]));
const days = sorted(stock.map((r) => r[0]));

const [mi, si, ci, gi, wi, di] = [months, storeNames, channels, cats, wh, days].map(indexOf);
const storeInfo = new Map(sales.map((r) => [r[1], [r[1], r[2], r[3], r[4]]]));

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  months,
  stores: storeNames.map((n) => storeInfo.get(n)),
  channels,
  cats,
  wh,
  days,
  f: sales.map((r) => [
    mi.get(Number(r[0])), si.get(r[1]), ci.get(r[5]), gi.get(r[6]),
    Math.round(Number(r[7])), Math.round(Number(r[8])), Number(r[9]), Number(r[10]),
  ]),
  o: orders.map((r) => [mi.get(Number(r[0])), si.get(r[1]), ci.get(r[2]), Number(r[3])]),
  // Sale lines only, split by whether they carry a discount. Same grain as `f`.
  d: sales
    .filter((r) => r.slice(11).some((v) => Number(v) !== 0))
    .map((r) => [
      mi.get(Number(r[0])), si.get(r[1]), ci.get(r[5]), gi.get(r[6]),
      ...r.slice(11).map((v) => Math.round(Number(v))),
    ]),
  s: stock.map((r) => [di.get(r[0]), wi.get(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])]),
  low: low.map((r) => [r[0], r[1], r[2], Number(r[3]), Number(r[4]), Number(r[5])]),
  cover: COVER_ORDER.map((k) => [k, Number(cover.find((r) => r[0] === k)?.[1] ?? 0)]),
};

mkdirSync(join(SITE, 'public', 'data'), { recursive: true });
const json = JSON.stringify(data);
writeFileSync(join(SITE, 'public', 'data', 'report.json'), json, 'utf8');

const sum = (rows, i) => rows.reduce((a, r) => a + r[i], 0);
console.log(`cells ${data.f.length}, order cells ${data.o.length}, stock rows ${data.s.length}, ${Math.round(json.length / 1024)} KB`);
console.log(`net ${sum(data.f, 4)}, cost ${sum(data.f, 5)}, qty ${sum(data.f, 6)}, orders ${sum(data.o, 3)}`);
