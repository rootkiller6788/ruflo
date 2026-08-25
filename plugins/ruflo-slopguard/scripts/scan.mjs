#!/usr/bin/env node
// ruflo-slopguard scanner — deterministic anti-slop static analysis.
//
// Zero-dependency Node ESM. Scores each scanned file 0-100 for "slop"
// (low-substance AI-generated filler). Higher = worse. Four deterministic
// rules: echo comments, filler identifiers, duplicate-block bloat, unused
// imports. Cross-platform (Windows / macOS / Linux), no bash, no shell pipes.
//
// CLI:
//   node scan.mjs --dir . --threshold 40 [--json] [--verbose] [--ignore a,b]
//                 [--ext ts,js,py] [--include-tests] [--badge-out BADGE.md]
//                 [--out report.json]
//
// Exit codes: 0 = pass (aggregate slop <= threshold), 1 = gate failed,
//             2 = usage error.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

export const FILLER = new Set([
  'a', 'b', 'c', 'tmp', 'temp', 'foo', 'bar', 'baz', 'val', 'value',
  'result', 'data', 'thing', 'stuff', 'dummy', 'placeholder',
]);

const DEFAULT_EXT = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py'];
// Generated / vendor dirs are always noise — never scanned, not even with
// --include-tests. Test code is handled separately (see TEST_*_RE below).
const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', 'vendor'];
const TEST_FILE_RE = /\.(test|spec)\.[^.]+$/;
const TEST_DIR_RE = /(^|[\\/])(__tests__|__mocks__|test|tests|spec)([\\/]|$)/;

// ---------- tokenization helpers ----------

// Words >= 3 chars, alphanumeric + underscore, case-folded, deduped.
function tokens(line) {
  return [...new Set(
    line.toLowerCase().replace(/[^a-z0-9_]/g, ' ').split(/\s+/)
        .filter((w) => w.length >= 3),
  )];
}

function jaccard(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  const set = new Set(a);
  let inter = 0;
  for (const t of b) if (set.has(t)) inter++;
  const union = a.length + b.length - inter;
  return union === 0 ? 0 : inter / union;
}

// ---------- Rule 1: echo comments ----------

// A full-line comment whose token set overlaps the code line below it.
function echoCommentHits(lines) {
  let hits = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (!isCommentLine(line)) continue;
    const commentText = stripCommentMarker(line);
    const ct = tokens(commentText);
    if (ct.length < 2) continue; // "// done" is not worth flagging
    // next non-empty, non-comment line
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === '' || isCommentLine(lines[j]))) j++;
    if (j >= lines.length) continue;
    if (jaccard(ct, tokens(lines[j])) >= 0.5) hits++;
  }
  return hits;
}

// ---------- Rule 2: filler identifiers ----------

function fillerDeclarationHits(content, isPy) {
  const reDecl = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  const reFunc = /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  const reFor = /\bfor\s*\(\s*(?:const|let|var)?\s*([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
  // Python: line-start assignment `tmp = …` (JS declarations don't exist there)
  const reAssign = /^[ \t]*([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm;
  const seen = new Set();
  const regexes = isPy ? [reAssign] : [reDecl, reFunc, reFor];
  for (const re of regexes) {
    let m;
    while ((m = re.exec(content)) !== null) {
      if (FILLER.has(m[1])) seen.add(m[1]);
    }
  }
  return seen.size;
}

// ---------- Rule 3: duplicate-block bloat ----------

function duplicateBloatRatio(lines) {
  const code = lines
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l.length > 0 && !isCommentLine(l));
  if (code.length < 4) return 0;
  const counts = new Map();
  for (const l of code) counts.set(l, (counts.get(l) ?? 0) + 1);
  let dupOccurrences = 0;
  for (const n of counts.values()) if (n > 1) dupOccurrences += n;
  return dupOccurrences / code.length;
}

// ---------- Rule 4: unused imports (TS/JS only) ----------

function parseImportClause(clause) {
  const locals = [];
  const rest = clause.trim();
  // namespace: `* as ns` (leading or after a default)
  const ns = rest.match(/\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (ns) locals.push(ns[1]);
  // default: `X` or `X,`
  const def = rest.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (def) locals.push(def[1]);
  // named: `{ a, b as c }`
  const braced = rest.match(/\{([\s\S]*)\}/);
  if (braced) {
    for (const part of braced[1].split(',')) {
      const p = part.trim();
      if (!p || p.startsWith('type ') || p.startsWith('typeof ')) continue;
      const alias = p.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (alias) locals.push(alias[2]);
      else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p)) locals.push(p);
    }
  }
  return locals;
}

const IMPORT_RE = /\bimport\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;

function unusedImportLocals(content) {
  const locals = new Set();
  const imports = [];
  let m;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    for (const l of parseImportClause(m[1])) locals.add(l);
    imports.push([m.index, m.index + m[0].length]);
  }
  if (locals.size === 0) return [];
  // body = content with import statements removed
  let body = '';
  let cursor = 0;
  for (const [start, end] of imports) {
    body += content.slice(cursor, start);
    cursor = end;
  }
  body += content.slice(cursor);
  const unused = [];
  for (const l of locals) {
    if (!new RegExp(`\\b${l}\\b`).test(body)) unused.push(l);
  }
  return unused;
}

// ---------- comment detection ----------

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('#');
}

function stripCommentMarker(line) {
  return line
    .trim()
    .replace(/^\/\/\s*/, '')
    .replace(/^#\s*/, '')
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .replace(/^\*\s*/, '')
    .trim();
}

// ---------- public API ----------

/**
 * Score one file's content. Returns:
 *   { slop, checks: { echo, filler, bloat, unused }, details: {...} }
 * slop: 0-100, higher = worse. Files with no code lines return slop 0.
 */
export function scanFile(content, filename) {
  const raw = content.replace(/^#![^\n]*\n?/, ''); // drop shebang
  const lines = raw.split(/\r?\n/);
  const ext = extname(filename || '').slice(1).toLowerCase();
  const isJsFamily = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext);

  const echo = echoCommentHits(lines);
  const filler = fillerDeclarationHits(raw, ext === 'py');
  const bloat = duplicateBloatRatio(lines);
  const unused = isJsFamily ? unusedImportLocals(raw).length : 0;

  const echoPenalty = Math.min(echo * 8, 24);
  const fillerPenalty = Math.min(filler * 4, 20);
  const bloatPenalty = bloat > 0.25 ? Math.min((bloat - 0.25) * 100, 20) : 0;
  const unusedPenalty = Math.min(unused * 10, 30);

  const slop = Math.max(0, Math.min(100, Math.round(echoPenalty + fillerPenalty + bloatPenalty + unusedPenalty)));

  return {
    slop,
    checks: { echo, filler, bloat: Math.round(bloat * 1000) / 1000, unused },
    details: { ext, codeLines: lines.filter((l) => l.trim() !== '').length },
  };
}

/**
 * Aggregate per-file results into { aggregateSlop, scanned, skipped, passed }.
 * Weighted by code-line count (bigger files count more). Files with 0 code
 * lines are counted as skipped.
 */
export function aggregate(results) {
  let total = 0;
  let weight = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.lines > 0) {
      total += r.lines * r.slop;
      weight += r.lines;
    } else {
      skipped++;
    }
  }
  return {
    aggregateSlop: weight === 0 ? 0 : Math.round((total / weight) * 10) / 10,
    scanned: results.length - skipped,
    skipped,
    passed: weight > 0,
  };
}

/** true when the aggregate slop is at or below the threshold (gate passes). */
export function decide(aggregateSlop, threshold) {
  return aggregateSlop <= threshold;
}

// ---------- CLI ----------

function usageError(msg) {
  console.error(`slopguard: ${msg}`);
  console.error('usage: node scan.mjs --dir <path> [--threshold <0-100>] [--json] [--verbose] [--ignore a,b] [--ext ts,js] [--include-tests] [--badge-out FILE] [--out FILE]');
  process.exit(2);
}

function parseArgs(argv) {
  const args = {
    dir: '.', threshold: 40, json: false, verbose: false,
    ignore: [], ext: DEFAULT_EXT, badgeOut: null, out: null, includeTests: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (i < argv.length - 1 ? argv[++i] : '');
    if (a === '--dir') args.dir = next();
    else if (a === '--threshold') args.threshold = Number(next());
    else if (a === '--json') args.json = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--ignore') args.ignore.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--ext') args.ext = next().split(',').map((s) => s.trim().replace(/^\./, '')).filter(Boolean);
    else if (a === '--badge-out') args.badgeOut = next();
    else if (a === '--out') args.out = next();
    else if (a === '--include-tests') args.includeTests = true;
    else if (a.startsWith('--')) usageError(`unknown flag: ${a}`);
    else usageError(`unexpected positional arg: ${a}`);
  }
  if (!Number.isFinite(args.threshold) || args.threshold < 0 || args.threshold > 100) {
    usageError(`--threshold must be a number in 0-100, got ${args.threshold}`);
  }
  return args;
}

function walk(dir, ignore, exts, includeTests, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (ignore.has(e.name)) continue;
      walk(full, ignore, exts, includeTests, out);
    } else if (e.isFile() && exts.has(extname(e.name).slice(1).toLowerCase())) {
      // Test code is skipped by default (fixtures trigger false positives on
      // the bloat rule); --include-tests re-admits it.
      if (!includeTests && (TEST_FILE_RE.test(e.name) || TEST_DIR_RE.test(full))) continue;
      out.push(full);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ignore = new Set([...DEFAULT_IGNORE, ...args.ignore]);
  const exts = new Set(args.ext);

  const files = walk(args.dir, ignore, exts, args.includeTests, []);
  const results = [];
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue; // unreadable (e.g. binary mislabeled) — skip silently
    }
    const r = scanFile(content, file);
    results.push({
      path: relative(process.cwd(), file).replace(/\\/g, '/'),
      lines: r.details.codeLines,
      slop: r.slop,
      checks: r.checks,
    });
  }

  const agg = aggregate(results);
  const passed = agg.scanned === 0 || decide(agg.aggregateSlop, args.threshold);

  if (args.json) {
    const doc = {
      plugin: 'ruflo-slopguard',
      version: '0.1.0',
      scanned: agg.scanned,
      skipped: agg.skipped,
      aggregateSlop: agg.aggregateSlop,
      quality: Math.round((100 - agg.aggregateSlop) * 10) / 10,
      threshold: args.threshold,
      passed,
      files: args.verbose
        ? results
        : results.map((r) => ({ path: r.path, slop: r.slop, lines: r.lines })),
    };
    process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  } else {
    if (agg.scanned === 0) {
      console.log(`slopguard: no files matched in ${args.dir} (ext: ${args.ext.join(',')})`);
    } else {
      const sorted = [...results].sort((a, b) => b.slop - a.slop);
      console.log(`${'slop'.padStart(5)}  ${'lines'.padStart(6)}  file`);
      for (const r of sorted.slice(0, 20)) {
        console.log(`${String(r.slop).padStart(5)}  ${String(r.lines).padStart(6)}  ${r.path}`);
      }
      if (sorted.length > 20) console.log(`  … ${sorted.length - 20} more files`);
      const mark = passed ? 'PASS' : 'FAIL';
      console.log(`\naggregate slop: ${agg.aggregateSlop}/100  (quality ${100 - agg.aggregateSlop})  threshold ${args.threshold}  → ${mark}`);
    }
  }

  if (args.badgeOut && agg.scanned > 0) {
    const q = Math.max(0, Math.min(100, Math.round(100 - agg.aggregateSlop)));
    const color = passed ? 'brightgreen' : 'critical';
    const badge = `![SlopGuard: ${q}/100](https://img.shields.io/badge/slop-${q}%2F100-${color})\n`;
    writeFileSync(args.badgeOut, badge, 'utf8');
    if (!args.json) console.log(`badge written: ${args.badgeOut}`);
  }
  if (args.out) {
    const doc = {
      plugin: 'ruflo-slopguard', version: '0.1.0',
      aggregateSlop: agg.aggregateSlop, quality: Math.round((100 - agg.aggregateSlop) * 10) / 10,
      threshold: args.threshold, passed, scanned: agg.scanned, skipped: agg.skipped,
      files: results,
    };
    writeFileSync(args.out, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    if (!args.json) console.log(`report written: ${args.out}`);
  }

  process.exit(passed ? 0 : 1);
}

// Run only when invoked directly (import.meta.url direct execution).
const isDirect = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isDirect) main();
