# SlopGuard Reference

Reference for `ruflo-slopguard` — the deterministic anti-slop quality gate.

## Scanner CLI

```
node plugins/ruflo-slopguard/scripts/scan.mjs [flags]
```

| Flag | Default | Description |
|---|---|---|
| `--dir <path>` | `.` | Directory tree to scan |
| `--threshold <0-100>` | `40` | Exit 1 when aggregate slop > threshold |
| `--json` | off | Emit a single JSON document to stdout (no human table) |
| `--verbose` | off | Per-file check breakdown |
| `--ignore <dirs>` | `node_modules,.git,dist,build` | Extra directories to skip (comma-separated) |
| `--ext <list>` | `ts,tsx,js,jsx,mjs,cjs,py` | File extensions to scan |
| `--badge-out <path>` | — | Write a self-contained markdown badge |
| `--out <path>` | — | Write the JSON report to a file (used by `report`) |

### Exit codes

- `0` — aggregate slop ≤ threshold (pass)
- `1` — aggregate slop > threshold (gate failed)
- `2` — usage error

## The four detection rules

A file starts at slop `0`; each hit adds penalty. Per-file slop clamps to
0-100, where **higher is worse** (i.e. more slop).

### 1. Echo comments (`echoPenalty`, max 24)

A comment line whose token set has Jaccard overlap ≥ 0.5 with the code line
immediately below it, and the comment has ≥ 2 tokens.

```ts
// return true
return true;                    // echo — comment restates the code
```

Tokens: words ≥ 3 chars, alphanumeric only, case-folded; operators/punctuation
stripped.

### 2. Filler identifiers (`fillerPenalty`, max 20)

Declared identifiers (const/let/var/function names, for-loop vars) whose name
is in the filler stoplist. −4 per flagged declaration, capped at 20.

```ts
const tmp = compute();          // filler
let foo = 1;                    // filler
```

Stoplist: `a b c i j tmp temp foo bar baz val value result data thing stuff dummy placeholder` (single letters `i`/`j` are legitimate loop counters and are NOT in the list).

### 3. Duplicate-block bloat (`bloatPenalty`, max 20)

Normalize non-empty code lines (collapse whitespace). If the ratio of
duplicated lines (lines that appear more than once) to total lines exceeds
`0.25`, penalty = `(ratio − 0.25) × 100`, capped at 20.

```ts
const a = f(1);                 // this block
const b = f(2);                 // repeated 4×
const c = f(3);                 // (generated boilerplate)
const d = f(4);
```

### 4. Unused imports (`unusedPenalty`, max 30) — TS/JS only

For each `import` statement, extract the imported identifiers (default, named,
and `* as ns`). An identifier that appears nowhere else in the file is unused.
−10 per unused identifier, capped at 30.

```ts
import { readFile } from 'node:fs';   // readFile never used below → −10
import { compute } from './util';     // used → no penalty
```

Side-effect-only imports (`import 'x'`) are skipped.

## Scoring

- `slop = clamp(echoPenalty + fillerPenalty + bloatPenalty + unusedPenalty, 0, 100)`
- `quality = 100 − slop` (higher is better, for the badge)
- **Aggregate** = line-count-weighted mean of per-file slop (bigger files count
  more). Files with zero code lines are skipped.

## JSON output shape

```json
{
  "scanned": 12,
  "skipped": 3,
  "aggregateSlop": 23.4,
  "threshold": 40,
  "passed": true,
  "files": [
    { "path": "src/index.ts", "slop": 8, "lines": 120,
      "checks": { "echo": 0, "filler": 0, "bloat": 0, "unused": 8 } }
  ]
}
```

## Library exports (for tests / embedding)

```js
import { scanFile, aggregate, decide, FILLER } from './scripts/scan.mjs';
```

- `scanFile(content, filename)` → `{ slop, checks: {echo,filler,bloat,unused}, details }`
- `aggregate(results)` → `{ aggregateSlop, scanned, skipped }`
- `decide(aggregateSlop, threshold)` → boolean (true = pass)

## Skill & agent

- Skill: [`slopguard-scan`](skills/slopguard-scan/SKILL.md)
- Agent: [`slopguard-analyst`](agents/slopguard-analyst.md)

## Compatibility

Plugin requires **Node 20+**. Zero npm dependencies. Works on Windows, macOS,
Linux, and in any CI that can run `node`.
