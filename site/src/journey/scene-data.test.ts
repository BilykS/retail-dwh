/**
 * Integrity of the scene's wiring. A thread pointing at a column that does not
 * exist would fail silently in the browser, as a value that never lands.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA, FLOWS, SOURCES, SOURCE_KEYS, STAGES, STAR_LINKS, TARGETS } from './scene-data.ts';

const ALL = { ...SOURCES, ...TARGETS };
const hasColumn = (table: string, column: string) =>
  ALL[table]?.columns.some((c) => c[0].replace('*', '') === column) ?? false;

test('every thread joins columns that exist', () => {
  for (const [from, to] of FLOWS) {
    const [a, ac] = from.split('.');
    const [b, bc] = to.split('.');
    assert.ok(hasColumn(a, ac), `missing source ${from}`);
    assert.ok(hasColumn(b, bc), `missing target ${to}`);
    assert.ok(TARGETS[b], `${to} is not a target table`);
  }
});

test('every target column gets a value, unless it is the table key', () => {
  const fed = new Set(FLOWS.map((f) => f[1]));
  for (const [table, def] of Object.entries(TARGETS)) {
    for (const [name] of def.columns) {
      if (name.endsWith('*')) continue;
      assert.ok(fed.has(`${table}.${name}`), `nothing feeds ${table}.${name}`);
    }
  }
});

test('a thread only leaves a target table that already exists', () => {
  for (const [from, to] of FLOWS) {
    const a = TARGETS[from.split('.')[0]];
    const b = TARGETS[to.split('.')[0]];
    if (a) assert.ok(a.stage < b.stage, `${from} is built after ${to}`);
  }
});

test('foreign keys and star links point at real columns', () => {
  for (const [a, ac, b, bc] of SOURCE_KEYS) {
    assert.ok(hasColumn(a, ac), `${a}.${ac}`);
    assert.ok(hasColumn(b, bc), `${b}.${bc}`);
  }
  for (const [fact, column, dim] of STAR_LINKS) {
    assert.ok(hasColumn(fact, column), `${fact}.${column}`);
    assert.ok(TARGETS[dim], `${dim} is not a target table`);
  }
});

test('both languages describe every camera stop', () => {
  assert.equal(STAGES.en.length, CAMERA.length);
  assert.equal(STAGES.uk.length, CAMERA.length);
  const stops = new Set(Object.values(TARGETS).map((t) => t.stage));
  for (const s of stops) assert.ok(s < CAMERA.length, `no camera stop for stage ${s}`);
});

test('the copy uses no long dashes', () => {
  const text = JSON.stringify(STAGES);
  assert.ok(!/[—–]/.test(text));
});
