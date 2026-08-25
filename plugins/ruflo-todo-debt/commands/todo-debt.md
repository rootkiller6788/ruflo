# /todo-debt — tech-debt marker gate

Scan code for TODO / FIXME / HACK / XXX / TEMP markers and gate on aggregate debt.

## Subcommands

| Subcommand | Description |
|---|---|
| `todo-debt scan` | Scan a directory, print per-file debt + aggregate total |
| `todo-debt check` | Same as scan, but exit 1 when total debt > threshold (CI gate) |
| `todo-debt report` | Scan and write `todo-debt-report.json` to disk |
| `todo-debt badge` | Scan and write a shareable `BADGE.md` with the total debt |
| `todo-debt gate` | Alias for `check` — explicit CI-oriented name |

## Usage

```bash
# Scan current dir
/todo-debt scan --dir . --threshold 50

# CI gate (exit 1 on failure)
/todo-debt check --dir src --json

# Write a report + badge
/todo-debt report --dir . --out .artifacts/todo-debt-report.json
/todo-debt badge --dir . --badge-out BADGE.md

# Verbose per-marker breakdown
/todo-debt scan --dir . --verbose
```

## Exit codes

- `0` — total debt ≤ threshold (pass)
- `1` — total debt > threshold (gate failed)
- `2` — usage error

## Implementation

All subcommands delegate to `scripts/scan.mjs`. The scanner is zero-dependency
Node ESM and works on Windows, macOS, and Linux (no bash, no shell pipelines).

```bash
node plugins/ruflo-todo-debt/scripts/scan.mjs --dir . --threshold 50
```

See the plugin [README](../README.md) and [REFERENCE](../REFERENCE.md) for the
full flag reference and the five marker severities.
