/**
 * Renders the report page from public/data/report.json and wires its filters.
 *
 * Each visual is redrawn from state on every change. There are few enough cells
 * that a full pass over the data on each click is imperceptible, and it keeps
 * the rendering free of incremental bookkeeping.
 */
import { type Locale, t } from '~/i18n';
import { type Formatter, formatter } from '~/lib/format';
import {
  type ReportData,
  type SalesFilter,
  type StoreRow,
  averageOnHand,
  avgCheck,
  currentTotals,
  dailyOnHand,
  discountSplit,
  emptyFilter,
  groupTotals,
  hasPrevious,
  marginPct,
  monthOf,
  monthlyMarginPct,
  monthlyNet,
  novDecShare,
  previousTotals,
  stockAt,
  stockByWarehouse,
  storeRows,
  storeTypeRows,
  yearOf,
} from './aggregate';
import * as label from './labels';

/* Fetched once per session. ClientRouter keeps this module alive across pages. */
let dataPromise: Promise<ReportData> | null = null;
const loadData = () =>
  (dataPromise ??= fetch('/data/report.json').then((r) => {
    if (!r.ok) throw new Error(`report.json: HTTP ${r.status}`);
    return r.json() as Promise<ReportData>;
  }));

/* Filters survive leaving the page and coming back. */
const sales: SalesFilter = emptyFilter();
const table = { sort: 'net' as 'name' | 'net' | 'marginPct' | 'orders', dir: -1 };
const stock = { warehouse: null as number | null, day: -1 };
let activeTab: 'sales' | 'stock' = 'sales';

/**
 * A question on the home page opens the report at the place that answers it:
 * /report?q=margin sets the filters and highlights the chart. Each year here
 * matches the period the home page quotes for that answer.
 */
const FOCUS = {
  margin: { tile: '#t-margin', year: 2025 },
  discount: { tile: '#t-discount', year: null },
  formats: { tile: '#t-formats', year: 2025 },
  season: { tile: '#t-months', year: 2025 },
} as const;
type Focus = keyof typeof FOCUS;
let focus: Focus | null = null;
let scrollToFocus = false;

function applyPreset() {
  const q = new URLSearchParams(location.search).get('q');
  if (!q || !(q in FOCUS)) return;
  focus = q as Focus;
  Object.assign(sales, emptyFilter(), { year: FOCUS[focus].year });
  activeTab = 'sales';
  scrollToFocus = true;
}

const esc = (s: string | number) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Picks a round axis step: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v || 1));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

class Report {
  private fmt: Formatter;
  private listeners = new AbortController();
  private observers: ResizeObserver[] = [];
  private stockSeries: number[] = [];
  private dayNumbers: number[];

  constructor(
    private root: HTMLElement,
    private data: ReportData,
    private lang: Locale,
  ) {
    this.fmt = formatter(lang);
    this.dayNumbers = data.days.map((d) => Date.parse(`${d}T00:00:00Z`) / 864e5);
    if (stock.day < 0) stock.day = data.days.length - 1;
  }

  private $<T extends HTMLElement = HTMLElement>(sel: string) {
    return this.root.querySelector<T>(sel)!;
  }

  private tr(key: string, vars?: Record<string, string | number>) {
    return t(this.lang, key, vars);
  }

  start() {
    this.wire();
    this.$<HTMLSelectElement>('#s-type').value = sales.storeType ?? '';
    this.renderStaticStock();
    this.setTab(activeTab);
    this.root.dataset.state = 'ready';

    if (scrollToFocus && focus) {
      this.$(FOCUS[focus].tile).scrollIntoView({ block: 'center' });
      scrollToFocus = false;
    }

    for (const [sel, draw] of [['#c-month', () => this.drawMonths()], ['#c-margin', () => this.drawMargin()], ['#c-day', () => this.drawDays()]] as const) {
      const ro = new ResizeObserver(draw);
      ro.observe(this.$(sel));
      this.observers.push(ro);
    }
  }

  destroy() {
    this.listeners.abort();
    this.observers.forEach((o) => o.disconnect());
  }

  private setTab(tab: 'sales' | 'stock') {
    activeTab = tab;
    this.$('#bi-sales').hidden = tab !== 'sales';
    this.$('#bi-stock').hidden = tab !== 'stock';
    this.$('#tab-sales').setAttribute('aria-selected', String(tab === 'sales'));
    this.$('#tab-stock').setAttribute('aria-selected', String(tab === 'stock'));
    if (tab === 'sales') this.renderSales();
    else this.renderStock();
  }

  /* ──────────────────────────── Shared pieces ─────────────────────────── */

  private kpi(title: string, value: string, delta = '') {
    return `<div class="kpi"><div class="kpi-t">${title}</div><div class="kpi-v">${value}</div><div class="kpi-d">${delta || '&nbsp;'}</div></div>`;
  }

  private bars(
    sel: string,
    name: string,
    items: { key: string | number; label: string; value: number; text: string; tip: string }[],
    selected: string | number | null,
  ) {
    const el = this.$(sel);
    const max = Math.max(1, ...items.map((x) => Math.abs(x.value)));
    el.classList.toggle('has-sel', selected !== null);
    el.innerHTML = items.length
      ? items
          .map((x) => {
            const on = String(selected) === String(x.key);
            const width = (Math.abs(x.value) / max).toFixed(4);
            return `<button type="button" class="brow${on ? ' on' : ''}" data-k="${esc(x.key)}" data-fid="${name}:${esc(x.key)}" aria-pressed="${on}" data-tip="${esc(x.tip)}"><span class="brow-n">${esc(x.label)}</span><span class="brow-t"><span class="brow-b" style="width:calc((100% - 4.5rem) * ${width})"></span><span class="brow-v">${x.text}</span></span></button>`;
          })
          .join('')
      : `<div class="bi-empty">${this.tr('report.empty')}</div>`;
  }

  private moneyTip(name: string, a: { net: number; cost: number }) {
    const pct = a.net ? ((a.net - a.cost) / a.net) * 100 : 0;
    return `${name}\n${this.tr('report.tip.revenue', { value: this.fmt.int(a.net) })}\n${this.tr('report.tip.margin', { value: this.fmt.dec(pct, 1) })}`;
  }

  private storeLabel(i: number) {
    const s = this.data.stores[i];
    return label.store(this.lang, s[0], s[1]);
  }

  private monthLabel(i: number) {
    return `${label.MONTHS[this.lang][monthOf(this.data, i) - 1]} ${yearOf(this.data, i)}`;
  }

  /* ──────────────────────────────── Sales ─────────────────────────────── */

  private renderSales() {
    const keep = document.activeElement?.getAttribute('data-fid');

    this.$('#s-year').innerHTML = ([[null, this.tr('report.all')], [2024, '2024'], [2025, '2025']] as const)
      .map(([y, text]) => `<button type="button" data-y="${y ?? ''}" data-fid="y:${text}" aria-pressed="${sales.year === y}">${text}</button>`)
      .join('');

    this.$<HTMLSelectElement>('#s-type').value = sales.storeType ?? '';
    this.renderFocus();
    this.renderChips();
    this.renderKpis();

    const { data, lang, fmt } = this;
    const byNet = <T extends { value: number }>(a: T, b: T) => b.value - a.value;

    const cats = groupTotals(data, sales, (c) => c[3], { cat: true });
    this.bars('#c-cat', 'cat', [...cats].map(([k, a]) => {
      const name = label.categoryGroup(lang, data.cats[k]);
      return { key: k, label: name, value: a.net, text: fmt.compact(a.net), tip: this.moneyTip(name, a) };
    }).sort(byNet), sales.cat);

    const regions = groupTotals(data, sales, (c) => data.stores[c[1]][2], { region: true });
    this.bars('#c-reg', 'reg', [...regions].map(([k, a]) => {
      const name = label.region(lang, k);
      return { key: k, label: name, value: a.net, text: fmt.compact(a.net), tip: this.moneyTip(name + this.tr('report.regionSuffix'), a) };
    }).sort(byNet), sales.region);

    const channels = groupTotals(data, sales, (c) => c[2], { channel: true });
    this.bars('#c-chan', 'chan', [...channels].map(([k, a]) => {
      const name = label.channel(lang, data.channels[k]);
      return { key: k, label: name, value: a.net, text: fmt.compact(a.net), tip: this.moneyTip(name, a) };
    }).sort(byNet), sales.channel);

    this.renderStores();
    this.renderFormats();
    this.renderDiscount();
    this.renderFindings();
    this.drawMonths();
    this.drawMargin();

    if (keep) this.root.querySelector<HTMLElement>(`[data-fid="${CSS.escape(keep)}"]`)?.focus();
  }

  private renderFocus() {
    const box = this.$('#s-focus');
    box.innerHTML = focus
      ? `<span>${esc(this.tr(`focus.${focus}`))}</span> <button type="button" data-focus-clear>${esc(this.tr('focus.clear'))}</button>`
      : '';
    this.root.querySelectorAll('.tile').forEach((t) => t.classList.remove('is-focus'));
    if (focus) this.$(FOCUS[focus].tile).classList.add('is-focus');
  }

  /* Chart headings state the finding, recalculated for the current filters. */
  private renderFindings() {
    const { data, fmt } = this;
    const share = sales.year !== null ? novDecShare(data, sales, sales.year) : null;
    this.$('#f-months').textContent = share !== null
      ? this.tr('report.f.season', { share: fmt.dec(share, 1) })
      : this.tr('report.t.months');

    const cur = currentTotals(data, sales);
    const prev = hasPrevious(data, sales) ? previousTotals(data, sales) : null;
    const pct = fmt.dec(marginPct(cur), 1);
    this.$('#f-margin').textContent = prev?.net
      ? this.tr('report.f.marginDelta', { pct, delta: fmt.signed(marginPct(cur) - marginPct(prev), 2, '') })
      : this.tr('report.f.margin', { pct });
  }

  private renderFormats() {
    const { lang, fmt } = this;
    const rows = storeTypeRows(this.data, sales).sort((a, b) => b.perStore - a.perStore);
    const typeName = (type: string) => label.STORE_TYPES[lang][type] ?? type;
    this.bars('#c-formats', 'fmt', rows.map((r) => ({
      key: r.type,
      label: typeName(r.type),
      value: r.perStore,
      text: fmt.compact(r.perStore),
      tip: `${typeName(r.type)}\n${this.tr('report.tip.stores', { value: fmt.int(r.stores) })}\n${this.tr('report.tip.revenue', { value: fmt.int(r.net) })}`,
    })), sales.storeType);
    this.$('#f-formats').textContent = rows.length
      ? this.tr('report.f.formats', { name: typeName(rows[0].type) })
      : this.tr('report.t.formats');
  }

  private renderDiscount() {
    const { fmt } = this;
    const split = discountSplit(this.data, sales);
    const pct = (a: { net: number; cost: number }) => (a.net > 0 ? ((a.net - a.cost) / a.net) * 100 : null);
    const withPct = pct(split.withDiscount);
    const withoutPct = pct(split.withoutDiscount);
    const heading = this.$('#f-discount');
    const box = this.$('#c-discount');
    const note = this.$('#n-discount');

    if (withPct === null || withoutPct === null) {
      heading.textContent = this.tr('report.t.discount');
      box.innerHTML = `<div class="bi-empty">${this.tr('report.empty')}</div>`;
      note.textContent = '';
      return;
    }

    heading.textContent = this.tr('report.f.discount', { a: fmt.dec(withPct, 1), b: fmt.dec(withoutPct, 1) });
    const max = Math.max(withPct, withoutPct);
    const row = (name: string, value: number, a: { net: number }) => {
      const tip = `${name}\n${this.tr('report.tip.revenue', { value: fmt.int(a.net) })}\n${this.tr('report.tip.margin', { value: fmt.dec(value, 1) })}`;
      return `<div class="brow is-static" data-tip="${esc(tip)}"><span class="brow-n">${name}</span><span class="brow-t"><span class="brow-b" style="width:calc((100% - 3rem) * ${(value / max).toFixed(4)})"></span><span class="brow-v">${fmt.dec(value, 1)}%</span></span></div>`;
    };
    box.innerHTML =
      row(this.tr('report.l.withDiscount'), withPct, split.withDiscount) +
      row(this.tr('report.l.withoutDiscount'), withoutPct, split.withoutDiscount);
    note.textContent = this.tr('report.n.discount', { value: fmt.compact(split.discount) });
  }

  private renderChips() {
    const { data, lang } = this;
    const chips: [keyof SalesFilter, string][] = [];
    if (sales.month !== null) chips.push(['month', this.monthLabel(sales.month)]);
    if (sales.cat !== null) chips.push(['cat', label.categoryGroup(lang, data.cats[sales.cat])]);
    if (sales.region !== null) chips.push(['region', label.region(lang, sales.region) + this.tr('report.regionSuffix')]);
    if (sales.channel !== null) chips.push(['channel', label.channel(lang, data.channels[sales.channel])]);
    if (sales.store !== null) chips.push(['store', this.storeLabel(sales.store)]);
    if (sales.storeType !== null) chips.push(['storeType', label.STORE_TYPES[lang][sales.storeType]]);

    this.$('#s-chips').innerHTML = chips.length
      ? chips
          .map(([k, text]) => `<button type="button" class="chip" data-c="${k}" data-fid="c:${k}" aria-label="${esc(this.tr('report.removeFilter', { name: text }))}">${esc(text)} <span aria-hidden="true">x</span></button>`)
          .join('') + `<button type="button" class="chip chip-reset" data-c="all" data-fid="c:all">${this.tr('report.reset')}</button>`
      : `<span class="bi-hint">${this.tr('report.hint')}</span>`;
  }

  private renderKpis() {
    const { data, fmt } = this;
    const cur = currentTotals(data, sales);
    const prev = hasPrevious(data, sales) ? previousTotals(data, sales) : null;
    const suffix = this.tr('report.vsLastYear');
    const delta = (now: number, was: number | undefined) =>
      prev && was ? `${fmt.signed(((now - was) / Math.abs(was)) * 100, 1, '%')} ${suffix}` : '';

    const margin = cur.net - cur.cost;
    const ppDelta = prev?.net ? `${fmt.signed(marginPct(cur) - marginPct(prev), 2, this.tr('report.pp'))} ${suffix}` : '';

    this.$('#s-kpis').innerHTML =
      this.kpi(this.tr('report.kpi.revenue'), fmt.compact(cur.net), delta(cur.net, prev?.net)) +
      this.kpi(this.tr('report.kpi.margin'), fmt.compact(margin), delta(margin, prev ? prev.net - prev.cost : undefined)) +
      this.kpi(this.tr('report.kpi.marginPct'), `${fmt.dec(marginPct(cur), 1)}%`, ppDelta) +
      this.kpi(this.tr('report.kpi.avgCheck'), fmt.int(avgCheck(cur)), delta(avgCheck(cur), prev ? avgCheck(prev) : undefined)) +
      this.kpi(this.tr('report.kpi.orders'), fmt.int(cur.orders), delta(cur.orders, prev?.orders));
  }

  private renderStores() {
    const { fmt } = this;
    const rows = storeRows(this.data, sales).map((r) => ({ ...r, name: this.storeLabel(r.store) }));
    const key = table.sort;
    rows.sort((a, b) => {
      if (key === 'name') return a.name.localeCompare(b.name, this.lang) * table.dir;
      return ((a as StoreRow)[key] - (b as StoreRow)[key]) * table.dir;
    });

    const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
    const th = (k: typeof table.sort, text: string, cls = '') => {
      const on = table.sort === k;
      const aria = on ? ` aria-sort="${table.dir < 0 ? 'descending' : 'ascending'}"` : '';
      return `<th class="${cls}"${aria}><button type="button" data-sort="${k}" data-fid="sort:${k}">${text}${on ? (table.dir < 0 ? ' ▼' : ' ▲') : ''}</button></th>`;
    };

    this.$('#c-store').innerHTML = rows.length
      ? `<table class="table"><thead><tr>${th('name', this.tr('report.col.store'))}${th('net', this.tr('report.col.revenue'), 'n')}${th('marginPct', this.tr('report.col.marginPct'), 'n')}${th('orders', this.tr('report.col.orders'), 'n')}</tr></thead><tbody>${rows
          .map((r) => `<tr data-s="${r.store}" class="${sales.store === r.store ? 'on' : ''}"><td>${esc(r.name)}</td><td class="n databar" style="--p:${((Math.abs(r.net) / max) * 100).toFixed(1)}%">${fmt.compact(r.net)}</td><td class="n">${fmt.dec(r.marginPct, 1)}</td><td class="n">${fmt.int(r.orders)}</td></tr>`)
          .join('')}</tbody></table>`
      : `<div class="bi-empty">${this.tr('report.empty')}</div>`;
  }

  private drawMonths() {
    const box = this.$('#c-month');
    const w = box.clientWidth;
    if (!w) return;
    const { data, fmt, lang } = this;

    const slots = data.months.map((_, i) => i).filter((i) => sales.year === null || yearOf(data, i) === sales.year);
    const net = monthlyNet(data, sales);
    const showPrev = sales.year === 2025;
    const prevOf = (i: number) => {
      const y = data.months.indexOf(data.months[i] - 100);
      return y === -1 ? null : net[y];
    };

    const values = slots.map((i) => net[i]);
    if (showPrev) for (const i of slots) { const p = prevOf(i); if (p !== null) values.push(p); }

    const top = Math.max(1, ...values) / 1e6;
    const step = niceStep(top / 4);
    const maxV = Math.ceil(top / step) * step;
    const floor = Math.min(0, ...values) < 0 ? -maxV * 0.08 : 0;

    const h = 250, l = 36, r = 6, tp = 16, b = 22;
    const y = (v: number) => tp + ((maxV - v) / (maxV - floor)) * (h - tp - b);
    const slot = (w - l - r) / slots.length;
    const bw = Math.min(24, slot - 3);
    let s = '';

    for (let k = 0; k * step <= maxV + 1e-9; k++) {
      const v = k * step;
      s += `<line class="${k ? 'gridl' : 'base'}" x1="${l}" x2="${w - r}" y1="${y(v)}" y2="${y(v)}"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt.dec(v, v % 1 ? 1 : 0)}</text>`;
    }

    const line: [number, number][] = [];
    slots.forEach((i, n) => {
      const v = net[i] / 1e6;
      const x = l + n * slot + (slot - bw) / 2;
      const y0 = y(0), yv = y(v), rad = Math.min(3, Math.abs(yv - y0));
      const dim = sales.month !== null && sales.month !== i;
      const path = v >= 0
        ? `M${x} ${y0}V${yv + rad}Q${x} ${yv} ${x + rad} ${yv}H${x + bw - rad}Q${x + bw} ${yv} ${x + bw} ${yv + rad}V${y0}Z`
        : `M${x} ${y0}H${x + bw}V${yv}H${x}Z`;
      const prev = showPrev ? prevOf(i) : null;
      const tip = `${this.monthLabel(i)}\n${this.tr('report.tip.revenue', { value: fmt.int(net[i]) })}${prev !== null ? `\n${this.tr('report.tip.lastYear', { value: fmt.int(prev) })}` : ''}`;

      s += `<rect class="hit" tabindex="0" role="button" data-m="${i}" data-fid="m:${i}" aria-label="${esc(tip.replace(/\n/g, ', '))}" data-tip="${esc(tip)}" x="${l + n * slot}" y="${tp}" width="${slot}" height="${h - tp - b}"/>`;
      s += `<path d="${path}" fill="var(${v < 0 ? '--data-2' : '--data-1'})" opacity="${dim ? 0.25 : 1}" pointer-events="none"/>`;
      if (prev !== null) line.push([x + bw / 2, y(prev / 1e6)]);

      const month = monthOf(data, i);
      const labelled = sales.year !== null ? w >= 460 || n % 2 === 0 : month === 1 || (month === 7 && w >= 500);
      if (labelled) {
        const last = sales.year === null && n === slots.length - 1;
        const text = `${label.MONTHS[lang][month - 1]}${sales.year === null && month === 1 ? ` ${yearOf(data, i)}` : ''}`;
        s += `<text x="${last ? w - r : l + n * slot + slot / 2}" y="${h - 6}" text-anchor="${last ? 'end' : 'middle'}">${text}</text>`;
      }
    });

    if (line.length) {
      s += `<polyline points="${line.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--data-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
      for (const [cx, cy] of line) s += `<circle cx="${cx}" cy="${cy}" r="4" fill="var(--data-2)" stroke="var(--paper-raised)" stroke-width="2" pointer-events="none"/>`;
    }

    box.innerHTML = `<svg width="${w}" height="${h}" role="group" aria-label="${esc(this.tr('report.t.months'))}">${s}</svg>`;
    this.$('#l-month').innerHTML = showPrev
      ? `<span><i style="background:var(--data-1)"></i>2025</span><span><i class="ln" style="background:var(--data-2)"></i>2024</span>`
      : '';
  }

  private drawMargin() {
    const box = this.$('#c-margin');
    const w = box.clientWidth;
    if (!w) return;
    const { data, fmt, lang } = this;

    const slots = data.months.map((_, i) => i).filter((i) => sales.year === null || yearOf(data, i) === sales.year);
    const series = monthlyMarginPct(data, sales);
    const showPrev = sales.year === 2025;
    const prevOf = (i: number) => {
      const y = data.months.indexOf(data.months[i] - 100);
      return y === -1 ? null : series[y];
    };

    const values = [...slots.map((i) => series[i]), ...(showPrev ? slots.map(prevOf) : [])].filter((v): v is number => v !== null);
    this.$('#l-margin').innerHTML = showPrev
      ? `<span><i style="background:var(--data-1)"></i>2025</span><span><i class="ln" style="background:var(--data-2)"></i>2024</span>`
      : '';
    if (!values.length) {
      box.innerHTML = `<div class="bi-empty">${this.tr('report.empty')}</div>`;
      return;
    }

    const lo = Math.min(...values), hi = Math.max(...values);
    const step = Math.max(0.5, niceStep((hi - lo || 1) / 4));
    const y0 = Math.floor(lo / step) * step;
    const y1 = Math.max(Math.ceil(hi / step) * step, y0 + step);
    const h = 250, l = 36, r = 6, tp = 16, b = 22;
    const Y = (v: number) => tp + ((y1 - v) / (y1 - y0)) * (h - tp - b);
    const slot = (w - l - r) / slots.length;
    const X = (n: number) => l + n * slot + slot / 2;

    let s = '';
    for (let v = y0; v <= y1 + 1e-6; v += step) {
      s += `<line class="${v === y0 ? 'base' : 'gridl'}" x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt.dec(v, step < 1 ? 1 : 0)}</text>`;
    }

    // A month with no meaningful margin breaks the line instead of being bridged.
    const path = (pick: (i: number) => number | null) => {
      let d = '';
      let open = false;
      slots.forEach((i, n) => {
        const v = pick(i);
        if (v === null) { open = false; return; }
        d += `${open ? 'L' : 'M'}${X(n).toFixed(1)} ${Y(v).toFixed(1)}`;
        open = true;
      });
      return d;
    };

    slots.forEach((i, n) => {
      const cur = series[i];
      const prev = showPrev ? prevOf(i) : null;
      const tip = `${this.monthLabel(i)}\n${this.tr('report.tip.margin', { value: cur === null ? '-' : fmt.dec(cur, 2) })}${prev !== null ? `\n${this.tr('report.tip.lastYearMargin', { value: fmt.dec(prev, 2) })}` : ''}`;
      s += `<rect class="hit" tabindex="0" role="button" data-m="${i}" data-fid="mm:${i}" aria-label="${esc(tip.replace(/\n/g, ', '))}" data-tip="${esc(tip)}" x="${l + n * slot}" y="${tp}" width="${slot}" height="${h - tp - b}"/>`;
      const month = monthOf(data, i);
      const labelled = sales.year !== null ? w >= 460 || n % 2 === 0 : month === 1 || (month === 7 && w >= 500);
      if (labelled) {
        const last = sales.year === null && n === slots.length - 1;
        const text = `${label.MONTHS[lang][month - 1]}${sales.year === null && month === 1 ? ` ${yearOf(data, i)}` : ''}`;
        s += `<text x="${last ? w - r : X(n)}" y="${h - 6}" text-anchor="${last ? 'end' : 'middle'}">${text}</text>`;
      }
    });

    if (showPrev) s += `<path d="${path(prevOf)}" fill="none" stroke="var(--data-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
    s += `<path d="${path((i) => series[i])}" fill="none" stroke="var(--data-1)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;

    if (sales.month !== null && slots.includes(sales.month) && series[sales.month] !== null) {
      s += `<circle cx="${X(slots.indexOf(sales.month))}" cy="${Y(series[sales.month]!)}" r="5" fill="var(--data-1)" stroke="var(--paper-raised)" stroke-width="2" pointer-events="none"/>`;
    }

    box.innerHTML = `<svg width="${w}" height="${h}" role="group" aria-label="${esc(this.tr('report.t.margin'))}">${s}</svg>`;
  }

  /* ──────────────────────────────── Stock ─────────────────────────────── */

  private renderStock() {
    const { data, fmt, lang } = this;
    const day = data.days[stock.day];
    const now = stockAt(data, stock.day, stock.warehouse);

    this.$('#w-date').textContent = this.tr('stock.asOf', { date: day });
    this.$('#w-chips').innerHTML = stock.warehouse !== null
      ? `<button type="button" class="chip" data-w="clear">${esc(label.warehouse(lang, data.wh[stock.warehouse]))} <span aria-hidden="true">x</span></button>`
      : `<span class="bi-hint">${this.tr('stock.hint')}</span>`;

    const onDate = this.tr('stock.d.date');
    this.$('#w-kpis').innerHTML =
      this.kpi(this.tr('stock.kpi.onHand'), fmt.int(now.onHand), onDate) +
      this.kpi(this.tr('stock.kpi.reserved'), fmt.int(now.reserved), onDate) +
      this.kpi(this.tr('stock.kpi.available'), fmt.int(now.available), this.tr('stock.d.available')) +
      this.kpi(this.tr('stock.kpi.inTransit'), fmt.int(now.inTransit), onDate) +
      this.kpi(this.tr('stock.kpi.avg'), fmt.int(averageOnHand(data, stock.warehouse)), this.tr('stock.d.period'));

    const byWh = stockByWarehouse(data, stock.day);
    this.bars('#c-wh', 'wh', data.wh.map((n, i) => {
      const name = label.warehouse(lang, n);
      return { key: i, label: name, value: byWh[i], text: fmt.int(byWh[i]), tip: `${name}\n${this.tr('stock.units', { value: fmt.int(byWh[i]) })}\n${day}` };
    }).sort((a, b) => b.value - a.value), stock.warehouse);

    this.drawDays();
  }

  private drawDays() {
    const box = this.$('#c-day');
    const w = box.clientWidth;
    if (!w) return;
    const { data, fmt, lang, dayNumbers } = this;

    const v = (this.stockSeries = dailyOnHand(data, stock.warehouse));
    const h = 240, l = 56, r = 10, tp = 12, b = 22;
    const x0 = dayNumbers[0], x1 = dayNumbers[dayNumbers.length - 1];
    const lo = Math.min(...v), hi = Math.max(...v);
    const step = Math.max(1, niceStep((hi - lo || 1) / 4));
    const y0 = Math.floor(lo / step) * step;
    const y1 = Math.max(Math.ceil(hi / step) * step, y0 + step);
    const X = (d: number) => l + ((d - x0) / (x1 - x0)) * (w - l - r);
    const Y = (q: number) => tp + ((y1 - q) / (y1 - y0)) * (h - tp - b);

    let s = '';
    for (let q = y0; q <= y1 + 1e-6; q += step) {
      s += `<line class="${q === y0 ? 'base' : 'gridl'}" x1="${l}" x2="${w - r}" y1="${Y(q)}" y2="${Y(q)}"/><text x="${l - 6}" y="${Y(q) + 4}" text-anchor="end">${fmt.int(q)}</text>`;
    }
    data.days.forEach((d, i) => {
      if (d.slice(8) === '01') s += `<text x="${X(dayNumbers[i])}" y="${h - 6}" text-anchor="${i ? 'middle' : 'start'}">${label.MONTHS[lang][Number(d.slice(5, 7)) - 1]}</text>`;
    });

    // A day missing from the source breaks the line, rather than being bridged.
    const path = v.map((q, i) => `${i === 0 || dayNumbers[i] - dayNumbers[i - 1] > 1 ? 'M' : 'L'}${X(dayNumbers[i]).toFixed(1)} ${Y(q).toFixed(1)}`).join('');
    s += `<path d="${path}" fill="none" stroke="var(--data-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;

    const sx = X(dayNumbers[stock.day]);
    s += `<line x1="${sx}" x2="${sx}" y1="${tp}" y2="${h - b}" stroke="var(--ink)" stroke-width="1"/><circle cx="${sx}" cy="${Y(v[stock.day])}" r="4.5" fill="var(--data-1)" stroke="var(--paper-raised)" stroke-width="2"/>`;
    s += `<rect id="d-hit" class="day-hit" tabindex="0" role="slider" aria-label="${esc(this.tr('stock.dateSlider'))}" aria-valuetext="${data.days[stock.day]}" aria-valuemin="0" aria-valuemax="${data.days.length - 1}" aria-valuenow="${stock.day}" x="${l}" y="${tp}" width="${w - l - r}" height="${h - tp - b}" data-l="${l}" data-w="${w - l - r}"/>`;

    box.innerHTML = `<svg width="${w}" height="${h}">${s}</svg>`;
  }

  /** The day closest to a pointer position over the stock chart. */
  private nearestDay(clientX: number, hit: SVGRectElement) {
    const rect = hit.getBoundingClientRect();
    const x0 = this.dayNumbers[0], x1 = this.dayNumbers[this.dayNumbers.length - 1];
    const target = x0 + ((clientX - rect.left) / rect.width) * (x1 - x0);
    let best = 0;
    this.dayNumbers.forEach((n, k) => {
      if (Math.abs(n - target) < Math.abs(this.dayNumbers[best] - target)) best = k;
    });
    return best;
  }

  private renderStaticStock() {
    const { data, fmt, lang } = this;
    const total = data.cover.reduce((a, [, n]) => a + n, 0);
    const max = Math.max(...data.cover.map(([, n]) => n));
    const SHORT = new Set(['lt30', 'd30', 'd90']);

    this.$('#c-cover').innerHTML = data.cover
      .map(([k, n]) => {
        const name = this.tr(`cover.${k}`);
        const tip = `${name}\n${this.tr('stock.products', { value: fmt.int(n), share: fmt.dec((n / total) * 100, 1) })}`;
        return `<div class="brow is-static" data-tip="${esc(tip)}"><span class="brow-n">${name}</span><span class="brow-t"><span class="brow-b" style="width:calc((100% - 2.5rem) * ${(n / max).toFixed(4)});background:var(${SHORT.has(k) ? '--data-2' : '--data-1'})"></span><span class="brow-v">${fmt.int(n)}</span></span></div>`;
      })
      .join('');

    this.$('#c-low').innerHTML = `<table class="table"><thead><tr><th>${this.tr('stock.col.product')}</th><th>${this.tr('stock.col.category')}</th><th class="n">${this.tr('stock.col.onHand')}</th><th class="n">${this.tr('stock.col.perDay')}</th><th class="n">${this.tr('stock.col.days')}</th></tr></thead><tbody>${data.low
      .map((r) => `<tr class="is-static"><td>${esc(r[1])}</td><td>${esc(label.productCategory(lang, r[2]))}</td><td class="n">${fmt.int(r[3])}</td><td class="n">${fmt.dec(r[4], 2)}</td><td class="n">${fmt.dec(r[5], 1)}</td></tr>`)
      .join('')}</tbody></table>`;
  }

  /* ──────────────────────────────── Events ────────────────────────────── */

  private wire() {
    const signal = this.listeners.signal;
    const tip = this.$('#bi-tip');

    this.$('#tab-sales').addEventListener('click', () => this.setTab('sales'), { signal });
    this.$('#tab-stock').addEventListener('click', () => this.setTab('stock'), { signal });

    this.$('#bi-sales').addEventListener('click', (e) => {
      if (this.onSalesClick(e.target as Element)) {
        tip.hidden = true;
        this.renderSales();
      }
    }, { signal });

    // SVG rects are not natively activatable.
    this.$('#bi-sales').addEventListener('keydown', (e) => {
      const el = e.target as Element;
      if ((e.key === 'Enter' || e.key === ' ') && el.matches('.hit')) {
        e.preventDefault();
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    }, { signal });

    this.$<HTMLSelectElement>('#s-type').addEventListener('change', (e) => {
      sales.storeType = (e.target as HTMLSelectElement).value || null;
      this.renderSales();
    }, { signal });

    this.$('#c-wh').addEventListener('click', (e) => {
      const b = (e.target as Element).closest('.brow');
      if (!b) return;
      const k = Number(b.getAttribute('data-k'));
      stock.warehouse = stock.warehouse === k ? null : k;
      tip.hidden = true;
      this.renderStock();
    }, { signal });

    this.$('#w-chips').addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-w]')) {
        stock.warehouse = null;
        this.renderStock();
      }
    }, { signal });

    const day = this.$('#c-day');
    day.addEventListener('pointermove', (e) => {
      const hit = e.target as SVGRectElement;
      if (hit.id !== 'd-hit') return;
      const k = this.nearestDay(e.clientX, hit);
      hit.setAttribute('data-tip', `${this.data.days[k]}\n${this.tr('stock.units', { value: this.fmt.int(this.stockSeries[k]) })}`);
    }, { signal });
    day.addEventListener('click', (e) => {
      const hit = e.target as SVGRectElement;
      if (hit.id !== 'd-hit') return;
      stock.day = this.nearestDay(e.clientX, hit);
      this.renderStock();
      this.$('#d-hit').focus();
    }, { signal });
    day.addEventListener('keydown', (e) => {
      if ((e.target as Element).id !== 'd-hit') return;
      const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!d) return;
      e.preventDefault();
      stock.day = Math.max(0, Math.min(this.data.days.length - 1, stock.day + d));
      this.renderStock();
      this.$('#d-hit').focus();
    }, { signal });

    // Shared tooltip. Runs after the handlers above, so a data-tip they just
    // updated is the one shown.
    document.addEventListener('pointermove', (e) => {
      const el = (e.target as Element).closest?.('[data-tip]');
      if (!el || !this.root.contains(el)) {
        tip.hidden = true;
        return;
      }
      tip.textContent = el.getAttribute('data-tip');
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      const x = e.clientX + 14 + r.width > innerWidth - 8 ? e.clientX - r.width - 14 : e.clientX + 14;
      const y = e.clientY - r.height - 10 < 8 ? e.clientY + 16 : e.clientY - r.height - 10;
      tip.style.left = `${Math.max(8, x)}px`;
      tip.style.top = `${y}px`;
    }, { signal });
    document.addEventListener('scroll', () => { tip.hidden = true; }, { signal, capture: true, passive: true });
  }

  /** Applies a click to the sales filters. Returns true when something changed. */
  private onSalesClick(target: Element): boolean {
    let b: Element | null;
    if ((b = target.closest('[data-y]'))) {
      const v = b.getAttribute('data-y');
      sales.year = v ? Number(v) : null;
      sales.month = null;
    } else if ((b = target.closest('[data-c]'))) {
      const c = b.getAttribute('data-c') as keyof SalesFilter | 'all';
      if (c === 'all') {
        Object.assign(sales, emptyFilter(), { year: sales.year });
        this.$<HTMLSelectElement>('#s-type').value = '';
      } else {
        Object.assign(sales, { [c]: null });
        if (c === 'storeType') this.$<HTMLSelectElement>('#s-type').value = '';
      }
    } else if ((b = target.closest('[data-m]'))) {
      const m = Number(b.getAttribute('data-m'));
      sales.month = sales.month === m ? null : m;
    } else if ((b = target.closest('#c-cat .brow'))) {
      const k = Number(b.getAttribute('data-k'));
      sales.cat = sales.cat === k ? null : k;
    } else if (target.closest('[data-focus-clear]')) {
      focus = null;
    } else if ((b = target.closest('#c-formats .brow'))) {
      const k = b.getAttribute('data-k');
      sales.storeType = sales.storeType === k ? null : k;
    } else if ((b = target.closest('#c-reg .brow'))) {
      const k = b.getAttribute('data-k');
      sales.region = sales.region === k ? null : k;
    } else if ((b = target.closest('#c-chan .brow'))) {
      const k = Number(b.getAttribute('data-k'));
      sales.channel = sales.channel === k ? null : k;
    } else if ((b = target.closest('[data-sort]'))) {
      const k = b.getAttribute('data-sort') as typeof table.sort;
      if (table.sort === k) table.dir = -table.dir;
      else {
        table.sort = k;
        table.dir = k === 'name' ? 1 : -1;
      }
    } else if ((b = target.closest('#c-store tbody tr'))) {
      const k = Number(b.getAttribute('data-s'));
      sales.store = sales.store === k ? null : k;
    } else {
      return false;
    }
    return true;
  }
}

let current: Report | null = null;

/** Starts the report on the current page, if this page has one. */
export async function mountReport() {
  const root = document.getElementById('report');
  if (!root) return;
  const lang = document.documentElement.lang as Locale;
  applyPreset();
  try {
    const data = await loadData();
    // The reader may have navigated away while the data was loading.
    if (!root.isConnected) return;
    current?.destroy();
    current = new Report(root, data, lang);
    current.start();
  } catch {
    root.dataset.state = 'failed';
  }
}

export function unmountReport() {
  current?.destroy();
  current = null;
}
