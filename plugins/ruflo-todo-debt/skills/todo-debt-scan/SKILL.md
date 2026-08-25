---
name: todo-debt-scan
description: Scan a directory for tech-debt markers (TODO / FIXME / HACK / XXX / TEMP), weight each by severity, sum the aggregate debt, and fail CI when it exceeds a threshold.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# todo-debt-scan

Run the tech-debt marker scanner over a project and get a per-file + aggregate
debt total.

## When to use

- Reviewing a PR or a batch of AI-generated code for accumulated debt markers.
- Adding a debt gate to CI so markers can't pile up silently.
- Triaging which `FIXME` / `HACK` to address first (severity-weighted).

## How

Invoke the scanner:

```bash
node plugins/ruflo-todo-debt/scripts/scan.mjs --dir . --threshold 50
```

Key flags (see `REFERENCE.md`):

- `--dir <path>` — directory to scan (default `.`)
- `--threshold <n>` — fail when total debt exceeds this (default `50`)
- `--json` — machine-readable JSON to stdout (for CI)
- `--verbose` — per-marker line + text breakdown
- `--ignore <dirs>` — comma-separated extra dirs to skip (default: `node_modules,.git,dist,build,coverage,.next,.turbo,vendor`)
- `--include-tests` — also scan test/spec files and dirs (skipped by default)

Exit codes:

- `0` — clean (total debt ≤ threshold)
- `1` — gate failed (total debt > threshold)
- `2` — usage error

## Markers scored (higher severity = more debt)

| Marker | Severity | Meaning |
|---|---|---|
| `FIXME` | 3 | known-broken, needs a fix |
| `HACK` | 2 | works, but by shortcut |
| `XXX` | 2 | dangerous / needs review |
| `TODO` | 1 | planned follow-up |
| `TEMP` | 1 | temporary, should not ship |

## Badge

`--badge-out BADGE.md` writes a self-contained markdown badge so the gate result
is shareable on a README or PR:

```markdown
![TodoDebt: 9](https://img.shields.io/badge/todo%20debt-9-brightgreen)
```

## CI example

```bash
node plugins/ruflo-todo-debt/scripts/scan.mjs --dir src --json --threshold 50 \
  || { echo "debt gate: tech-debt markers exceeded threshold"; exit 1; }
```
