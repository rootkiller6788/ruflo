// Regression tests for scripts/scan.mjs — deterministic anti-slop scoring.
// Run: node --test plugins/ruflo-slopguard/scripts/__tests__/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanFile, aggregate, decide, FILLER } from '../scan.mjs';

test('clean file scores 0 slop', () => {
  const src = [
    'export function compute(left, right) {',
    '  const total = left + right;',
    '  return total;',
    '}',
    '',
  ].join('\n');
  const r = scanFile(src, 'clean.ts');
  assert.equal(r.slop, 0);
});

test('echo comment is flagged', () => {
  const src = '// return true\nreturn true;\n';
  const r = scanFile(src, 'echo.ts');
  assert.ok(r.slop > 0, `expected slop > 0, got ${r.slop}`);
  assert.ok(r.checks.echo >= 1);
});

test('filler identifiers are flagged (JS)', () => {
  const src = 'const tmp = 1;\nconst foo = 2;\nlet result = compute();\n';
  const r = scanFile(src, 'filler.ts');
  assert.ok(r.slop > 0, `expected slop > 0, got ${r.slop}`);
  assert.ok(r.checks.filler >= 3);
});

test('filler identifiers are flagged (Python assignment)', () => {
  const src = 'tmp = 1\nfoo = 2\nresult = compute()\n';
  const r = scanFile(src, 'filler.py');
  assert.ok(r.checks.filler >= 3, `expected >=3 filler in py, got ${r.checks.filler}`);
  assert.ok(r.slop > 0);
});

test('duplicate-block bloat is flagged', () => {
  const src = Array(8).fill('const x = handler(1);').join('\n') + '\n';
  const r = scanFile(src, 'bloat.ts');
  assert.ok(r.checks.bloat > 0.25, `expected bloat ratio > 0.25, got ${r.checks.bloat}`);
  assert.ok(r.slop > 0);
});

test('unused import is flagged', () => {
  const src = "import { readFile } from 'node:fs';\nimport { join } from 'node:path';\nexport const HOME = '/tmp';\n";
  const r = scanFile(src, 'unused.ts');
  assert.ok(r.checks.unused >= 2, `expected >=2 unused, got ${r.checks.unused}`);
  assert.ok(r.slop > 0);
});

test('used import is not flagged', () => {
  const src = "import { join } from 'node:path';\nexport const p = join('a', 'b');\n";
  const r = scanFile(src, 'used.ts');
  assert.equal(r.checks.unused, 0);
  assert.equal(r.slop, 0);
});

test('aliased unused import flags the local name', () => {
  const src = "import { x as y } from 'mod';\nexport const z = 1;\n";
  const r = scanFile(src, 'alias.ts');
  assert.ok(r.checks.unused >= 1);
  assert.ok(r.slop > 0);
});

test('unused import penalty is capped at 30', () => {
  const names = Array.from({ length: 8 }, (_, i) => `never${i}`);
  const src = `import { ${names.join(', ')} } from 'mod';\nexport const z = 1;\n`;
  const r = scanFile(src, 'cap.ts');
  assert.ok(r.slop >= 30, `expected cap at 30, got ${r.slop}`);
});

test('side-effect import is skipped', () => {
  const src = "import 'polyfill';\nexport const z = 1;\n";
  const r = scanFile(src, 'side-effect.ts');
  assert.equal(r.checks.unused, 0);
});

test('aggregate is weighted by line count', () => {
  const results = [
    { path: 'big-clean.ts', lines: 100, slop: 0 },
    { path: 'small-dirty.ts', lines: 10, slop: 100 },
  ];
  const agg = aggregate(results);
  // (100*0 + 10*100) / 110 ≈ 9.1
  assert.equal(agg.aggregateSlop, 9.1);
  assert.equal(agg.scanned, 2);
});

test('aggregate skips empty files', () => {
  const results = [{ path: 'empty.ts', lines: 0, slop: 0 }];
  const agg = aggregate(results);
  assert.equal(agg.scanned, 0);
  assert.equal(agg.skipped, 1);
});

test('decide() gates on threshold', () => {
  assert.equal(decide(40, 40), true); // at threshold passes
  assert.equal(decide(41, 40), false);
  assert.equal(decide(0, 40), true);
});

test('filler stoplist contains expected names', () => {
  assert.ok(FILLER.has('tmp'));
  assert.ok(FILLER.has('result'));
  assert.ok(!FILLER.has('i')); // single-letter loop counter stays legal
  assert.ok(!FILLER.has('total'));
});
