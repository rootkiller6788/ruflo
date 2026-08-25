---
name: slopguard-scan
description: Scan a directory for low-substance AI-generated code (echo comments, filler identifiers, duplicate-block bloat, unused imports), score each file 0-100, and fail CI when aggregate slop exceeds a threshold.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# slopguard-scan

Run the anti-slop scanner over a project and get a per-file + aggregate score.

## When to use

- Reviewing a PR or a batch of AI-generated code for "slop" (low-substance filler).
- Adding a quality gate to CI so generated code can't merge silently.
- Checking a single file or directory before committing.

## How

Invoke the scanner:

```bash
node plugins/ruflo-slopguard/scripts/scan.mjs --dir . --threshold 40
```

Key flags (see `REFERENCE.md`):

- `--dir <path>` — directory to scan (default `.`)
- `--threshold <0-100>` — fail when aggregate slop exceeds this (default `40`)
- `--json` — machine-readable JSON to stdout (for CI)
- `--verbose` — per-file check breakdown
- `--ignore <dirs>` — comma-separated extra dirs to skip (default: `node_modules,.git,dist,build`)

Exit codes:

- `0` — clean (aggregate slop ≤ threshold)
- `1` — gate failed (aggregate slop > threshold)
- `2` — usage error

## Rules scored (higher slop = worse)

| Check | What it catches |
|---|---|
| Echo comments | `// return true` directly above `return true;` — comment restates the code |
| Filler identifiers | Declarations named `a`, `tmp`, `foo`, `val`, `result`, `data` … |
| Duplicate bloat | Files dominated by repeated identical lines (generated boilerplate) |
| Unused imports | `import { x } from …` where `x` never appears in the body (TS/JS only) |

## Badge

`--badge-out BADGE.md` writes a self-contained markdown badge so the gate result is shareable on a README or PR:

```markdown
![SlopGuard: 23/100](https://img.shields.io/badge/slop-23%2F100-success)
```

## CI example

```bash
node plugins/ruflo-slopguard/scripts/scan.mjs --dir src --json --threshold 40 \
  || { echo "slopgate: generated-code hygiene failed"; exit 1; }
```
