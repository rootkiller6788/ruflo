#!/usr/bin/env node
// ruflo-todo-debt scanner — deterministic tech-debt marker counter.
//
// Zero-dependency Node ESM. Scans files for TODO / FIXME / HACK / XXX / TEMP
// markers, weights them by severity, and gates on the aggregate "debt" total.
// Cross-platform (Windows / macOS / Linux), no bash, no shell pipes.
//
// CLI:
//   node scan.mjs --dir . --threshold 50 [--json] [--verbose] [--ignore a,b]
//                 [--ext ts,js,md] [--include-tests] [--badge-out BADGE.md]
//                 [--out report.json]
//
// Exit codes: 0 = pass (total debt <= threshold), 1 = gate failed,
//             2 = usage error.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

export const MARKERS = [
  { type: 'FIXME', re: /\bFIXME\b/i, severity: 3 },
  { type: 'HACK', re: /\bHACK\b/i, severity: 2 },
  { type: 'XXX', re: /\bXXX\b/i, severity: 2 },
  { type: 'TODO', re: /\bTODO\b/i, severity: 1 },
  { type: 'TEMP', re: /\bTEMP\b/i, severity: 1 },
];

const DEFAULT_EXT = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'md'];
// Generated / vendor dirs are always noise — never scanned, not even with
// --include-tests. Test code is handled separately (see TEST_*_RE below).
const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', 'vendor'];
const TEST_FILE_RE = /\.(test|spec)\.[^.]+$/;
const TEST_DIR_RE = /(^|[\\/])(__tests__|__mocks__|test|tests|spec)([\\/]|$)/;

/**
 * Scan one file's content. Returns:
 *   { markers: [{ type, line, severity, text }], debt }
 * debt = sum of marker severities (FIXME counts more than TODO).
 */
export function scanFile(content, filename) {
  const lines = content.split(/\r?\n/);
  const markers = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const m of MARKERS) {
      const match = line.match(m.re);
      if (match) {
        const rest = line.slice(match.index).trim();
        markers.push({ type: m.type, line: i + 1, severity: m.severity, text: rest.slice(0, 80) });
      }
    }
  }
  const debt = markers.reduce((s, m) => s + m.severity, 0);
  return { markers, debt };
}

/**
 * Aggregate per-file results. Returns
 * { totalDebt, totalMarkers, filesWith, filesScanned }.
 */
export function aggregate(results) {
  let totalDebt = 0;
  let totalMarkers = 0;
  let filesWith = 0;
  for (const r of results) {
    if (r.markers.length > 0) {
      totalDebt += r.debt;
      totalMarkers += r.markers.length;
      filesWith++;
    }
  }
  return { totalDebt, totalMarkers, filesWith, filesScanned: results.length };
}

/** true when total debt is at or below the threshold (gate passes). */
export function decide(totalDebt, threshold) {
  return totalDebt <= threshold;
}

// ---------- CLI ----------

function usageError(msg) {
  console.error(`todo-debt: ${msg}`);
  console.error('usage: node scan.mjs --dir <path> [--threshold <n>] [--json] [--verbose] [--ignore a,b] [--ext ts,js] [--include-tests] [--badge-out FILE] [--out FILE]');
  process.exit(2);
}

function parseArgs(argv) {
  const args = {
    dir: '.', threshold: 50, json: false, verbose: false,
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
  if (!Number.isFinite(args.threshold) || args.threshold < 0) {
    usageError(`--threshold must be a number >= 0, got ${args.threshold}`);
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
      continue;
    }
    const r = scanFile(content, file);
    results.push({
      path: relative(process.cwd(), file).replace(/\\/g, '/'),
      markers: r.markers,
      debt: r.debt,
    });
  }

  const agg = aggregate(results);
  const passed = decide(agg.totalDebt, args.threshold);

  if (args.json) {
    const doc = {
      plugin: 'ruflo-todo-debt',
      version: '0.1.0',
      filesScanned: agg.filesScanned,
      filesWith: agg.filesWith,
      totalMarkers: agg.totalMarkers,
      totalDebt: agg.totalDebt,
      threshold: args.threshold,
      passed,
      files: args.verbose
        ? results
        : results.filter((r) => r.markers.length > 0).map((r) => ({ path: r.path, debt: r.debt, count: r.markers.length })),
    };
    process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  } else {
    if (agg.filesWith === 0) {
      console.log(`todo-debt: no markers in ${args.dir} (ext: ${args.ext.join(',')}) — clean`);
    } else {
      const withMarkers = results.filter((r) => r.markers.length > 0).sort((a, b) => b.debt - a.debt);
      for (const r of withMarkers.slice(0, 20)) {
        console.log(`${String(r.debt).padStart(4)}  ${r.path}`);
        if (args.verbose) {
          for (const mk of r.markers) console.log(`         ${mk.line}: ${mk.type} ${mk.text}`);
        }
      }
      if (withMarkers.length > 20) console.log(`  … ${withMarkers.length - 20} more files`);
      const mark = passed ? 'PASS' : 'FAIL';
      console.log(`\ntotal debt: ${agg.totalDebt}  (${agg.totalMarkers} markers in ${agg.filesWith} files)  threshold ${args.threshold}  → ${mark}`);
    }
  }

  if (args.badgeOut) {
    const color = passed ? 'brightgreen' : 'critical';
    const badge = `![TodoDebt: ${agg.totalDebt}](https://img.shields.io/badge/todo%20debt-${agg.totalDebt}-${color})\n`;
    writeFileSync(args.badgeOut, badge, 'utf8');
    if (!args.json) console.log(`badge written: ${args.badgeOut}`);
  }
  if (args.out) {
    const doc = {
      plugin: 'ruflo-todo-debt', version: '0.1.0',
      filesScanned: agg.filesScanned, filesWith: agg.filesWith,
      totalMarkers: agg.totalMarkers, totalDebt: agg.totalDebt,
      threshold: args.threshold, passed,
      files: results.filter((r) => r.markers.length > 0),
    };
    writeFileSync(args.out, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    if (!args.json) console.log(`report written: ${args.out}`);
  }

  process.exit(passed ? 0 : 1);
}

// Run only when invoked directly.
const isDirect = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isDirect) main();
