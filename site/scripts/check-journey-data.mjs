#!/usr/bin/env node
/**
 * Compares every value shown in the data journey scene with the warehouse. The
 * values live in src/journey/scene-data.ts, and nothing else would notice if the
 * warehouse changed underneath them.
 *
 * Run: node scripts/check-journey-data.mjs (needs the warehouse running)
 */

import { SOURCES, TARGETS } from '../src/journey/scene-data.ts';
import { query } from './warehouse.mjs';

const WHERE = {
  brands: 'src.brands where brand_id = 16',
  categories: 'src.categories where category_id = 29',
  product_changes: 'src.product_changes where change_id = 343',
  price_history: 'src.price_history where price_id = 835',
  products: 'src.products where product_id = 430',
  order_items: 'src.order_items where order_item_id = 260',
  orders: 'src.orders where order_id = 101',
  employees: 'src.employees where employee_id = 178',
  customers: 'src.customers where customer_id = 8394',
  stores: 'src.stores where store_id = 16',
  cities: 'src.cities where city_id = 7',
  warehouses: 'wms.warehouses where warehouse_id = 4',
  articles: 'wms.articles where article_id = 430',
  stock_daily: "wms.stock_daily where snapshot_date = '2025-09-23' and warehouse_id = 4 and article_id = 430",
  dim_product: 'dbt_star.dim_product where product_id = 430',
  dim_store: 'dbt_star.dim_store where store_id = 16',
  dim_customer: 'dbt_star.dim_customer where customer_id = 8394',
  dim_date: 'dbt_star.dim_date where date_key = 20250923',
  dim_transaction_type: "dbt_star.dim_transaction_type where transaction_type_key like 'fc3239fd%'",
  fact_sales: 'dbt_star.fact_sales where order_item_id = 260',
  dim_warehouse: 'dbt_star.dim_warehouse where warehouse_id = 4',
  dim_article: 'dbt_star.dim_article where article_id = 430',
  fact_inventory: "dbt_star.fact_inventory where date_key = 20250923 and warehouse_key like 'a87ff679%' and article_key like 'f74909ac%'",
  stock_cover: "dbt_star.stock_cover where product_key like 'f74909ac%'",
};

/**
 * A shown value matches when it is the stored one, a shortened hash, a timestamp cut
 * to fewer characters, or a number rounded to the decimals it is shown with.
 */
function matches(shown, stored) {
  const actual = stored === null ? 'null' : String(stored);
  if (shown === actual) return true;
  if (shown.endsWith('...')) return actual.startsWith(shown.slice(0, -3));
  if (/^\d{4}-\d{2}-\d{2}T/.test(actual)) return actual.replace('T', ' ').startsWith(shown);
  const a = Number(shown), b = Number(actual);
  if (shown === '' || actual === '' || Number.isNaN(a) || Number.isNaN(b)) return false;
  const decimals = shown.split('.')[1]?.length ?? 0;
  return Math.abs(a - b) <= 0.5 * 10 ** -decimals + 1e-9;
}

let checked = 0;
const problems = [];
for (const [table, def] of Object.entries({ ...SOURCES, ...TARGETS })) {
  if (!WHERE[table]) { problems.push(`${table}: no query`); continue; }
  const relation = WHERE[table].split(' where ')[0];
  const total = query(`select count(*) from ${relation}`)[0][0];
  checked++;
  if (def.rows.replace(/\s/g, '') !== String(total)) problems.push(`${table}: shows ${def.rows} rows, warehouse has ${total}`);
  const rows = query(`select row_to_json(t) from (select * from ${WHERE[table]}) t`);
  if (rows.length !== 1) { problems.push(`${table}: expected one row, got ${rows.length}`); continue; }
  const row = JSON.parse(rows[0][0]);
  for (const [column, shown] of def.columns) {
    const name = column.replace('*', '');
    if (!(name in row)) { problems.push(`${table}.${name}: no such column`); continue; }
    checked++;
    if (!matches(shown, row[name])) problems.push(`${table}.${name}: shows ${shown}, warehouse has ${row[name]}`);
  }
}

console.log(`checked ${checked} values`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('all match the warehouse');
