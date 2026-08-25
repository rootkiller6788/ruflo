// Regression tests for scripts/scan.mjs — deterministic tech-debt markers.
// Run: node --test plugins/ruflo-todo-debt/scripts/__tests__/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanFile, aggregate, decide, MARKERS } from '../scan.mjs';

test('finds TODO with severity 1', () => {
  const r = scanFile('// TODO: rate-limit this\nconst x = 1;\n', 'a.ts');
  assert.equal(r.debt, 1);
  assert.equal(r.markers.length, 1);
  assert.equal(r.markers[0].type, 'TODO');
  assert.equal(r.markers[0].severity, 1);
});

test('finds FIXME with severity 3', () => {
  const r = scanFile('// FIXME: crashes on empty input\n', 'a.ts');
  assert.equal(r.debt, 3);
  assert.equal(r.markers[0].type, 'FIXME');
  assert.equal(r.markers[0].severity, 3);
});

test('finds HACK and XXX with severity 2 each', () => {
  const r = scanFile('// HACK: works around it\n// XXX: remove me\n', 'a.ts');
  assert.equal(r.markers.length, 2);
  assert.equal(r.debt, 4);
  assert.ok(r.markers.every((m) => m.severity === 2));
});

test('debt is the sum of all marker severities', () => {
  const src = '// TODO a\n// FIXME b\n// HACK c\n// XXX d\n// TEMP e\n';
  const r = scanFile(src, 'a.ts');
  // 1 + 3 + 2 + 2 + 1 = 9
  assert.equal(r.debt, 9);
  assert.equal(r.markers.length, 5);
});

test('reports correct 1-based line numbers', () => {
  const src = 'const a = 1;\n\n// TODO: later\nconst b = 2;\n// FIXME: now\n';
  const r = scanFile(src, 'a.ts');
  assert.deepEqual(r.markers.map((m) => m.line), [3, 5]);
});

test('clean file has no markers', () => {
  const src = 'export function compute(l, r) {\n  return l + r;\n}\n';
  const r = scanFile(src, 'clean.ts');
  assert.equal(r.markers.length, 0);
  assert.equal(r.debt, 0);
});

test('matching is case-insensitive', () => {
  const src = '// todo: lowercase\n// fixme: uppercase\n';
  const r = scanFile(src, 'a.ts');
  assert.equal(r.markers.length, 2);
  assert.equal(r.debt, 4); // 1 + 3
});

test('word boundary respected (TODOABLE does not match)', () => {
  const src = 'const TODOABLE = 1;\nconst FIXMEX = 2;\n';
  const r = scanFile(src, 'a.ts');
  assert.equal(r.markers.length, 0);
  assert.equal(r.debt, 0);
});

test('captures the marker text snippet', () => {
  const r = scanFile('// TODO: clean up this helper\n', 'a.ts');
  assert.ok(r.markers[0].text.startsWith('TODO'));
  assert.ok(r.markers[0].text.includes('clean up'));
});

test('aggregate sums debt and counts markers and files', () => {
  const results = [
    { path: 'a.ts', markers: [{ type: 'TODO', severity: 1 }], debt: 1 },
    { path: 'b.ts', markers: [{ type: 'FIXME', severity: 3 }, { type: 'HACK', severity: 2 }], debt: 5 },
    { path: 'c.ts', markers: [], debt: 0 },
  ];
  const agg = aggregate(results);
  assert.equal(agg.totalDebt, 6);
  assert.equal(agg.totalMarkers, 3);
  assert.equal(agg.filesWith, 2);
  assert.equal(agg.filesScanned, 3);
});

test('aggregate handles an empty result set', () => {
  const agg = aggregate([]);
  assert.equal(agg.totalDebt, 0);
  assert.equal(agg.totalMarkers, 0);
  assert.equal(agg.filesWith, 0);
  assert.equal(agg.filesScanned, 0);
});

test('decide() gates on threshold', () => {
  assert.equal(decide(50, 50), true); // at threshold passes
  assert.equal(decide(51, 50), false);
  assert.equal(decide(0, 50), true);
});

test('MARKERS declares the five expected types', () => {
  const types = MARKERS.map((m) => m.type);
  assert.deepEqual(types, ['FIXME', 'HACK', 'XXX', 'TODO', 'TEMP']);
  assert.ok(MARKERS.every((m) => typeof m.severity === 'number' && m.re instanceof RegExp));
});
