# /slopguard — anti-slop quality gate

Scan code for low-substance AI-generated patterns and gate on the score.

## Subcommands

| Subcommand | Description |
|---|---|
| `slopguard scan` | Scan a directory, print per-file scores + aggregate slop |
| `slopguard check` | Same as scan, but exit 1 when aggregate slop > threshold (CI gate) |
| `slopguard report` | Scan and write `slopguard-report.json` + markdown summary to disk |
| `slopguard badge` | Scan and write a shareable `BADGE.md` with the aggregate slop score |
| `slopguard gate` | Alias for `check` — explicit CI-oriented name |

## Usage

```bash
# Scan current dir
/slopguard scan --dir . --threshold 40

# CI gate (exit 1 on failure)
/slopguard check --dir src --json

# Write a report + badge
/slopguard report --dir . --out .artifacts
/slopguard badge --dir . --badge-out BADGE.md

# Verbose per-file breakdown
/slopguard scan --dir . --verbose
```

## Exit codes

- `0` — aggregate slop ≤ threshold (pass)
- `1` — aggregate slop > threshold (gate failed)
- `2` — usage error

## Implementation

All subcommands delegate to `scripts/scan.mjs`. The scanner is zero-dependency
Node ESM and works on Windows, macOS, and Linux (no bash, no shell pipelines).

```bash
node plugins/ruflo-slopguard/scripts/scan.mjs --dir . --threshold 40
```

See the plugin [README](../README.md) and [REFERENCE](../REFERENCE.md) for the
full flag reference and the four detection rules.
