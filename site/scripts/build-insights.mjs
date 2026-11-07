#!/usr/bin/env node
/**
 * Answers the business questions on the home page and writes them, together with
 * the SQL behind them, to src/data/insights.json.
 *
 * The page prints these exact query strings under each answer, so a reader sees
 * the query that produced the number rather than a tidied-up copy of it.
 *
 * Run: node scripts/build-insights.mjs
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './warehouse.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');

const SQL = {
  margin: `select d.year,
       sum(f.net_amount)                 as revenue,
       sum(f.net_amount - f.cost_amount) as margin,
       round(100 * sum(f.net_amount - f.cost_amount) / sum(f.net_amount), 2) as margin_pct
from star.fact_sales f
join star.dim_date d using (date_key)
where d.year in (2024, 2025)
group by d.year
order by d.year;`,

  priceEffect: `-- What margin would have been if no supplier price had ever changed.
with first_cost as (
    select p.product_id,
           coalesce((select pc.old_value::numeric
                     from src.product_changes pc
                     where pc.product_id = p.product_id
                       and pc.field_name = 'unit_cost'
                     order by pc.changed_at
                     limit 1), p.unit_cost) as unit_cost
    from src.products p
)
select d.year,
       sum(f.cost_amount) - sum(i.quantity * fc.unit_cost) as cost_added_by_price_rises,
       round(100 * (sum(f.net_amount) - sum(i.quantity * fc.unit_cost)) / sum(f.net_amount), 2) as margin_pct_at_first_cost
from star.fact_sales f
join star.dim_date d using (date_key)
join src.order_items i using (order_item_id)
join first_cost fc on fc.product_id = i.product_id
where d.year in (2024, 2025)
group by d.year
order by d.year;`,

  discount: `select f.discount_amount > 0 as discounted,
       count(*)               as lines,
       sum(f.net_amount)      as revenue,
       sum(f.discount_amount) as discount,
       round(100 * sum(f.net_amount - f.cost_amount) / sum(f.net_amount), 1) as margin_pct
from star.fact_sales f
where f.quantity > 0
group by 1
order by 1;`,

  products: `with revenue as (
    select p.product_id, sum(f.net_amount) as net
    from star.fact_sales f
    join star.dim_product p using (product_key)
    group by p.product_id
), running as (
    select net, sum(net) over (order by net desc) / sum(net) over () as share
    from revenue
)
select count(*) filter (where share <= 0.80)                 as a_products,
       count(*) filter (where share > 0.80 and share <= 0.95) as b_products,
       count(*) filter (where share > 0.95)                  as c_products,
       round(100 * sum(net) filter (where share > 0.95) / sum(net), 1) as c_share_pct
from running;`,

  formats: `select s.store_type,
       count(distinct s.store_key)                     as stores,
       sum(f.net_amount) / count(distinct s.store_key) as revenue_per_store
from star.fact_sales f
join star.dim_store s using (store_key)
join star.dim_date d using (date_key)
where d.year = 2025
group by s.store_type
order by revenue_per_store desc;`,

  season: `select d.year,
       round(100 * sum(f.net_amount) filter (where d.month >= 11) / sum(f.net_amount), 1) as nov_dec_share_pct
from star.fact_sales f
join star.dim_date d using (date_key)
where d.year in (2024, 2025)
group by d.year
order by d.year;`,
};

// Chart data and supporting counts. Not printed on the page.
const MONTHLY = `
  with actual as (
    select d.year * 100 + d.month as ym, sum(f.net_amount) as net, sum(f.cost_amount) as cost
    from star.fact_sales f join star.dim_date d using (date_key)
    where d.year in (2024, 2025) group by 1
  ), at_current_cost as (
    select (extract(year from o.ordered_at) * 100 + extract(month from o.ordered_at))::int as ym,
           sum((i.quantity * p.unit_cost)::numeric(12,2)) as cost
    from src.order_items i join src.orders o using (order_id) join src.products p using (product_id)
    where o.status <> 'cancelled' group by 1
  )
  select a.ym, round(100 * (a.net - a.cost) / a.net, 2), round(100 * (a.net - c.cost) / a.net, 2)
  from actual a join at_current_cost c using (ym) order by 1`;

const CURRENT_COST_YEARS = `
  select extract(year from o.ordered_at)::int,
         round(100 * (1 - sum(i.quantity * p.unit_cost) / sum(i.quantity * i.unit_price * (1 - i.discount_pct / 100))), 2)
  from src.order_items i join src.orders o using (order_id) join src.products p using (product_id)
  where o.status <> 'cancelled' and extract(year from o.ordered_at) in (2024, 2025)
  group by 1 order by 1`;

const PRICE_CHANGES = `
  select count(*), count(*) filter (where new_value::numeric > old_value::numeric),
         round(avg(100 * (new_value::numeric / old_value::numeric - 1)), 1), min(changed_at)::date
  from src.product_changes where field_name = 'unit_cost'`;

const num = Number;
const margin = query(SQL.margin);
const price = query(SQL.priceEffect);
const discount = query(SQL.discount);
const [products] = query(SQL.products);
const formats = query(SQL.formats);
const season = query(SQL.season);
const [changes] = query(PRICE_CHANGES);
const currentCost = query(CURRENT_COST_YEARS);

const discountRow = (r) => ({ lines: num(r[1]), revenue: num(r[2]), discount: num(r[3]), marginPct: num(r[4]) });

const insights = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sql: SQL,
  margin: margin.map((r) => ({ year: num(r[0]), revenue: num(r[1]), margin: num(r[2]), pct: num(r[3]) })),
  priceEffect: price.map((r) => ({ year: num(r[0]), costAdded: num(r[1]), pctAtFirstCost: num(r[2]) })),
  currentCost: currentCost.map((r) => ({ year: num(r[0]), pct: num(r[1]) })),
  priceChanges: { count: num(changes[0]), rises: num(changes[1]), avgRisePct: num(changes[2]), first: changes[3] },
  monthly: query(MONTHLY).map((r) => ({ ym: num(r[0]), actual: num(r[1]), atCurrentCost: num(r[2]) })),
  discount: {
    without: discountRow(discount.find((r) => r[0] === 'f')),
    with: discountRow(discount.find((r) => r[0] === 't')),
  },
  products: { a: num(products[0]), b: num(products[1]), c: num(products[2]), cSharePct: num(products[3]) },
  formats: formats.map((r) => ({ type: r[0], stores: num(r[1]), perStore: num(r[2]) })),
  season: season.map((r) => ({ year: num(r[0]), pct: num(r[1]) })),
};

writeFileSync(join(SITE, 'src', 'data', 'insights.json'), `${JSON.stringify(insights, null, 2)}\n`, 'utf8');

const [a, b] = insights.margin;
console.log(`margin ${a.pct}% to ${b.pct}%, change ${Math.round(b.margin - a.margin)} UAH`);
console.log(`at first cost ${insights.priceEffect.map((p) => p.pctAtFirstCost).join(' to ')}, cost added in 2025 ${Math.round(insights.priceEffect[1].costAdded)}`);
console.log(`at current cost ${insights.currentCost.map((p) => p.pct).join(' to ')}`);
