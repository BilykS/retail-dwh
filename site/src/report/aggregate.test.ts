/**
 * Checks the report's measures against figures queried from the warehouse. The
 * expected values were taken from SQL on star (sales) and dbt_star (stock), not
 * from this code. If the warehouse changes, refresh them from SQL by hand:
 * copying them from the report would make these tests prove nothing.
 *
 * Amounts in the data file are rounded to whole hryvnias per cell, so revenue is
 * compared with a tolerance. Order counts and stock must match exactly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  type ReportData,
  averageOnHand,
  currentTotals,
  emptyFilter,
  marginPct,
  previousTotals,
  stockAt,
  storeRows,
} from './aggregate.ts';

const data: ReportData = JSON.parse(
  readFileSync(new URL('../../public/data/report.json', import.meta.url), 'utf8'),
);

const ELECTRONICS = data.cats.indexOf('Електроніка');
const WEB = data.channels.indexOf('web');
const LAST_DAY = data.days.length - 1;
const CLOSE = 200; // UAH of rounding allowed on a total

test('all years match the warehouse totals', () => {
  const t = currentTotals(data, { ...emptyFilter(), year: null });
  assert.ok(Math.abs(t.net - 4_375_145_993.13) < CLOSE);
  assert.ok(Math.abs(t.cost - 2_912_024_151.08) < CLOSE);
  assert.equal(t.orders, 93_091);
});

test('2025 matches SQL', () => {
  const t = currentTotals(data, emptyFilter());
  assert.ok(Math.abs(t.net - 2_196_102_967) < CLOSE);
  assert.equal(t.orders, 46_629);
  assert.ok(Math.abs(t.cost - 1_469_817_227.57) < CLOSE);
  assert.equal(marginPct(t).toFixed(2), '33.07');
});

test('order counts stay distinct when a category is selected', () => {
  const t = currentTotals(data, { ...emptyFilter(), cat: ELECTRONICS });
  assert.ok(Math.abs(t.net - 1_077_473_236.5) < CLOSE);
  assert.equal(t.orders, 18_241);
});

test('a sale counts in the category the product had on that day', () => {
  // 12.75 M with current categories, 34.10 M with the category at the time of sale.
  const food = data.cats.indexOf('Продукти харчування');
  const t = currentTotals(data, { ...emptyFilter(), year: null, cat: food });
  assert.ok(Math.abs(t.net - 34_103_715.99) < CLOSE);
  assert.equal(t.orders, 27_011);
});

test('category and channel filters combine', () => {
  const t = currentTotals(data, { ...emptyFilter(), cat: ELECTRONICS, channel: WEB });
  assert.ok(Math.abs(t.net - 245_393_790.44) < CLOSE);
  assert.equal(t.orders, 4_179);
});

test('the previous period of 2025 is 2024', () => {
  const t = previousTotals(data, emptyFilter());
  assert.ok(Math.abs(t.net - 2_182_640_267.75) < CLOSE);
});

test('store rows add up to the total', () => {
  const rows = storeRows(data, emptyFilter());
  assert.equal(rows.length, 30);
  assert.equal(rows.reduce((a, r) => a + r.orders, 0), 46_629);
});

test('stock is read at one date, never summed across dates', () => {
  const t = stockAt(data, LAST_DAY, null);
  assert.equal(t.onHand, 319_639);
  assert.equal(t.reserved, 87_331);
  assert.equal(t.available, 232_308);
  assert.equal(Math.round(averageOnHand(data, null)), 320_924);
});

test('one warehouse at the last date matches SQL', () => {
  const brovary = data.wh.indexOf('Центральний склад Бровари');
  const t = stockAt(data, LAST_DAY, brovary);
  assert.equal(t.onHand, 74_246);
  assert.equal(t.reserved, 20_300);
  assert.equal(t.available, 53_946);
});
