# TodoDebt Reference

Reference for `ruflo-todo-debt` — the deterministic tech-debt marker gate.

## Scanner CLI

```
node plugins/ruflo-todo-debt/scripts/scan.mjs [flags]
```

| Flag | Default | Description |
|---|---|---|
| `--dir <path>` | `.` | Directory tree to scan |
| `--threshold <n>` | `50` | Exit 1 when total debt > threshold |
| `--json` | off | Emit a single JSON document to stdout (no human table) |
| `--verbose` | off | Per-marker line + text breakdown |
| `--ignore <dirs>` | `node_modules,.git,dist,build,coverage,.next,.turbo,vendor` | Extra directories to skip (comma-separated) |
| `--ext <list>` | `ts,tsx,js,jsx,mjs,cjs,py,md` | File extensions to scan |
| `--include-tests` | off | Also scan `*.test.*` / `*.spec.*` files and files under `test`/`__tests__`/`spec` dirs (skipped by default) |
| `--badge-out <path>` | — | Write a self-contained markdown badge |
| `--out <path>` | — | Write the JSON report to a file (used by `report`) |

### Exit codes

- `0` — total debt ≤ threshold (pass)
- `1` — total debt > threshold (gate failed)
- `2` — usage error

## The five markers

A file's `debt` is the sum of its marker severities. Markers are matched with
case-insensitive word-boundary regexes, so `TODO`, `todo`, and `Todo` all hit,
but `TODOABLE` does not.

| Marker | Severity | Regex | Meaning |
|---|---|---|---|
| `FIXME` | 3 | `/\bFIXME\b/i` | known-broken, needs a fix |
| `HACK` | 2 | `/\bHACK\b/i` | works, but by shortcut |
| `XXX` | 2 | `/\bXXX\b/i` | dangerous / needs review |
| `TODO` | 1 | `/\bTODO\b/i` | planned follow-up |
| `TEMP` | 1 | `/\bTEMP\b/i` | temporary, should not ship |

```ts
// TODO: rate-limit this later        → debt +1
// FIXME: crashes on empty input      → debt +3
function hack() { /* HACK */ }        → debt +2
```

## Scoring

- Per-file: `debt = Σ marker severity`.
- Aggregate: `totalDebt = Σ file debt`; `totalMarkers = Σ marker count`;
  `filesWith` = files containing ≥1 marker; `filesScanned` = files walked.
- Gate passes when `totalDebt ≤ threshold` (default `50`).

## JSON output shape

```json
{
  "plugin": "ruflo-todo-debt",
  "version": "0.1.0",
  "filesScanned": 12,
  "filesWith": 3,
  "totalMarkers": 5,
  "totalDebt": 9,
  "threshold": 50,
  "passed": true,
  "files": [
    { "path": "src/api.ts", "debt": 5, "count": 2 }
  ]
}
```

## Library exports (for tests / embedding)

```js
import { scanFile, aggregate, decide, MARKERS } from './scripts/scan.mjs';
```

- `scanFile(content, filename)` → `{ markers, debt }`, where each marker is
  `{ type, line, severity, text }`.
- `aggregate(results)` → `{ totalDebt, totalMarkers, filesWith, filesScanned }`.
- `decide(totalDebt, threshold)` → boolean (true = pass).
- `MARKERS` → `[{ type, re, severity }]`.

## Skill & agent

- Skill: [`todo-debt-scan`](skills/todo-debt-scan/SKILL.md)
- Agent: [`todo-debt-analyst`](agents/todo-debt-analyst.md)

## Compatibility

Plugin requires **Node 20+**. Zero npm dependencies. Works on Windows, macOS,
Linux, and in any CI that can run `node`.
