/**
 * The report's measures, as pure functions over the rolled-up data. Nothing here
 * touches the DOM, so aggregate.test.ts can check it against figures from SQL.
 */

/** month, store, channel, category, net, cost, quantity, orders within the category */
export type SalesCell = [number, number, number, number, number, number, number, number];
/** month, store, channel, orders */
export type OrderCell = [number, number, number, number];
/** month, store, channel, category, then for sale lines: net and cost with a discount, net and cost without, discount given */
export type DiscountCell = [number, number, number, number, number, number, number, number, number];
/** day, warehouse, on hand, reserved, in transit, available */
export type StockRow = [number, number, number, number, number, number];
/** sku, name, category, stock, sold per day, days of cover */
export type LowRow = [string, string, string, number, number, number];
/** name, city, region, type */
export type Store = [string, string, string, string];

export interface ReportData {
  generatedAt: string;
  months: number[];
  stores: Store[];
  channels: string[];
  cats: string[];
  wh: string[];
  days: string[];
  f: SalesCell[];
  o: OrderCell[];
  d: DiscountCell[];
  s: StockRow[];
  low: LowRow[];
  cover: [string, number][];
}

export interface SalesFilter {
  year: number | null;
  month: number | null;
  cat: number | null;
  channel: number | null;
  region: string | null;
  store: number | null;
  storeType: string | null;
}

export const emptyFilter = (): SalesFilter => ({
  year: 2025,
  month: null,
  cat: null,
  channel: null,
  region: null,
  store: null,
  storeType: null,
});

/** Dimensions a visual leaves out of the filter, so its own bars stay visible. */
type Exclude = { cat?: boolean; channel?: boolean; region?: boolean; store?: boolean; storeType?: boolean };

export interface Totals {
  net: number;
  cost: number;
  orders: number;
}

export const yearOf = (data: ReportData, month: number) => Math.floor(data.months[month] / 100);
export const monthOf = (data: ReportData, month: number) => data.months[month] % 100;

function dimsMatch(data: ReportData, f: SalesFilter, store: number, channel: number, ex: Exclude = {}) {
  if (!ex.channel && f.channel !== null && channel !== f.channel) return false;
  if (!ex.store && f.store !== null && store !== f.store) return false;
  if (!ex.region && f.region !== null && data.stores[store][2] !== f.region) return false;
  if (!ex.storeType && f.storeType !== null && data.stores[store][3] !== f.storeType) return false;
  return true;
}

export function inPeriod(data: ReportData, f: SalesFilter, month: number): boolean {
  if (f.month !== null) return month === f.month;
  return f.year === null || yearOf(data, month) === f.year;
}

/** A year-over-year comparison exists only for periods inside 2025. */
export function hasPrevious(data: ReportData, f: SalesFilter): boolean {
  return f.month !== null ? yearOf(data, f.month) === 2025 : f.year === 2025;
}

/** True when this month is the same month one year before the selected period. */
function inPreviousPeriod(data: ReportData, f: SalesFilter, month: number): boolean {
  const next = data.months.indexOf(data.months[month] + 100);
  return next !== -1 && inPeriod(data, f, next);
}

/**
 * An order sits in exactly one month, store and channel, so counts add up across
 * those. It can span categories, so with a category chosen the counts come from
 * that category's cells, and otherwise from the order cube.
 */
function sumTotals(data: ReportData, f: SalesFilter, matchesMonth: (m: number) => boolean): Totals {
  const a: Totals = { net: 0, cost: 0, orders: 0 };
  for (const [m, s, c, g, net, cost, , orders] of data.f) {
    if (!matchesMonth(m) || !dimsMatch(data, f, s, c) || (f.cat !== null && g !== f.cat)) continue;
    a.net += net;
    a.cost += cost;
    if (f.cat !== null) a.orders += orders;
  }
  if (f.cat === null) {
    for (const [m, s, c, orders] of data.o) {
      if (matchesMonth(m) && dimsMatch(data, f, s, c)) a.orders += orders;
    }
  }
  return a;
}

export const currentTotals = (data: ReportData, f: SalesFilter) =>
  sumTotals(data, f, (m) => inPeriod(data, f, m));

export const previousTotals = (data: ReportData, f: SalesFilter) =>
  sumTotals(data, f, (m) => inPreviousPeriod(data, f, m));

export const marginPct = (t: Totals) => (t.net ? ((t.net - t.cost) / t.net) * 100 : 0);
export const avgCheck = (t: Totals) => (t.orders ? t.net / t.orders : 0);

/** Revenue and cost grouped by a key, ignoring the visual's own dimension. */
export function groupTotals<K extends string | number>(
  data: ReportData,
  f: SalesFilter,
  key: (cell: SalesCell) => K,
  ex: Exclude,
): Map<K, { net: number; cost: number }> {
  const out = new Map<K, { net: number; cost: number }>();
  for (const cell of data.f) {
    const [m, s, c, g, net, cost] = cell;
    if (!inPeriod(data, f, m) || !dimsMatch(data, f, s, c, ex)) continue;
    if (!ex.cat && f.cat !== null && g !== f.cat) continue;
    const k = key(cell);
    const a = out.get(k) ?? { net: 0, cost: 0 };
    a.net += net;
    a.cost += cost;
    out.set(k, a);
  }
  return out;
}

/** Net revenue per month, ignoring the time filter so the chart keeps its shape. */
export function monthlyNet(data: ReportData, f: SalesFilter): number[] {
  const out = data.months.map(() => 0);
  for (const [m, s, c, g, net] of data.f) {
    if (dimsMatch(data, f, s, c) && (f.cat === null || g === f.cat)) out[m] += net;
  }
  return out;
}

/**
 * Margin % per month, ignoring the time filter. A month with no positive revenue
 * has no meaningful margin, such as January 2026, which holds only returns.
 */
export function monthlyMarginPct(data: ReportData, f: SalesFilter): (number | null)[] {
  const net = data.months.map(() => 0);
  const cost = data.months.map(() => 0);
  for (const [m, s, c, g, n, co] of data.f) {
    if (!dimsMatch(data, f, s, c) || (f.cat !== null && g !== f.cat)) continue;
    net[m] += n;
    cost[m] += co;
  }
  return net.map((n, m) => (n > 0 ? ((n - cost[m]) / n) * 100 : null));
}

/** Share of a year's revenue that falls on November and December. */
export function novDecShare(data: ReportData, f: SalesFilter, year: number): number | null {
  const net = monthlyNet(data, f);
  let peak = 0;
  let total = 0;
  net.forEach((n, m) => {
    if (yearOf(data, m) !== year) return;
    total += n;
    if (monthOf(data, m) >= 11) peak += n;
  });
  return total > 0 ? (peak / total) * 100 : null;
}

export interface DiscountSplit {
  withDiscount: { net: number; cost: number };
  withoutDiscount: { net: number; cost: number };
  discount: number;
}

/** Sale lines with a discount against the rest. Returns are left out of both. */
export function discountSplit(data: ReportData, f: SalesFilter): DiscountSplit {
  const a: DiscountSplit = { withDiscount: { net: 0, cost: 0 }, withoutDiscount: { net: 0, cost: 0 }, discount: 0 };
  for (const [m, s, c, g, netD, costD, netN, costN, disc] of data.d) {
    if (!inPeriod(data, f, m) || !dimsMatch(data, f, s, c) || (f.cat !== null && g !== f.cat)) continue;
    a.withDiscount.net += netD;
    a.withDiscount.cost += costD;
    a.withoutDiscount.net += netN;
    a.withoutDiscount.cost += costN;
    a.discount += disc;
  }
  return a;
}

export interface StoreTypeRow {
  type: string;
  net: number;
  cost: number;
  stores: number;
  perStore: number;
}

/** Revenue per store by store type, ignoring the store type filter itself. */
export function storeTypeRows(data: ReportData, f: SalesFilter): StoreTypeRow[] {
  const totals = groupTotals(data, f, (cell) => data.stores[cell[1]][3], { storeType: true, store: true });
  const stores = groupTotals(data, f, (cell) => cell[1], { storeType: true, store: true });
  return [...totals].map(([type, t]) => {
    const count = [...stores.keys()].filter((s) => data.stores[s][3] === type).length;
    return { type, net: t.net, cost: t.cost, stores: count, perStore: count ? t.net / count : 0 };
  });
}

export interface StoreRow {
  store: number;
  net: number;
  marginPct: number;
  orders: number;
}

export function storeRows(data: ReportData, f: SalesFilter): StoreRow[] {
  const totals = groupTotals(data, f, (cell) => cell[1], { store: true });
  const orders = new Map<number, number>();
  const add = (s: number, n: number) => orders.set(s, (orders.get(s) ?? 0) + n);

  if (f.cat !== null) {
    for (const [m, s, c, g, , , , n] of data.f) {
      if (inPeriod(data, f, m) && g === f.cat && dimsMatch(data, f, s, c, { store: true })) add(s, n);
    }
  } else {
    for (const [m, s, c, n] of data.o) {
      if (inPeriod(data, f, m) && dimsMatch(data, f, s, c, { store: true })) add(s, n);
    }
  }

  return [...totals].map(([store, t]) => ({
    store,
    net: t.net,
    marginPct: t.net ? ((t.net - t.cost) / t.net) * 100 : 0,
    orders: orders.get(store) ?? 0,
  }));
}

/* ───────────────────────────────── Stock ─────────────────────────────────
   Stock is semi-additive: it adds up across warehouses but never across dates.
   Every figure below is read at one date, except the explicit average. */

export interface StockTotals {
  onHand: number;
  reserved: number;
  inTransit: number;
  available: number;
}

export function stockAt(data: ReportData, day: number, warehouse: number | null): StockTotals {
  const a: StockTotals = { onHand: 0, reserved: 0, inTransit: 0, available: 0 };
  for (const [d, w, onHand, reserved, inTransit, available] of data.s) {
    if (d !== day || (warehouse !== null && w !== warehouse)) continue;
    a.onHand += onHand;
    a.reserved += reserved;
    a.inTransit += inTransit;
    a.available += available;
  }
  return a;
}

/** On-hand stock per warehouse at one date. */
export function stockByWarehouse(data: ReportData, day: number): number[] {
  const out = data.wh.map(() => 0);
  for (const [d, w, onHand] of data.s) if (d === day) out[w] = onHand;
  return out;
}

/** Total on-hand stock per day, for the trend line. */
export function dailyOnHand(data: ReportData, warehouse: number | null): number[] {
  const out = data.days.map(() => 0);
  for (const [d, w, onHand] of data.s) if (warehouse === null || w === warehouse) out[d] += onHand;
  return out;
}

/** Average of the daily totals. avg() is the valid way to summarise over time. */
export function averageOnHand(data: ReportData, warehouse: number | null): number {
  const series = dailyOnHand(data, warehouse);
  return series.reduce((a, b) => a + b, 0) / series.length;
}
