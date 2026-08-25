# ruflo-slopguard

**Anti-slop quality gate for AI-generated code.** Statically score how much
low-substance filler lives in your codebase — echo comments, filler
identifiers, duplicate boilerplate, unused imports — and fail CI when the
aggregate "slop" crosses a threshold.

Zero dependencies. Offline. Cross-platform (Windows / macOS / Linux). No LLM
in the loop — deterministic by design; the optional agent only reviews the
scanner's output.

> Compatible with `@claude-flow/cli` v3.6+. Load with
> `claude --plugin-dir plugins/ruflo-slopguard`.

## Why

2026's agentic-coding wave means most new code is at least partially
model-generated. Lint, types, and test coverage are all blind to code that is
*correct but hollow*: a comment that restates the line beneath it, a `tmp`
here and a `val` there, a pasted boilerplate block repeated five times, an
import that was never used. That's slop — and it erodes the codebase faster
than a bug does.

## Quick start

```bash
# Scan the current tree, human-readable
node plugins/ruflo-slopguard/scripts/scan.mjs --dir .

# CI gate: fail when aggregate slop exceeds 40
node plugins/ruflo-slopguard/scripts/scan.mjs --dir src --json --threshold 40 \
  || { echo "slopgate failed"; exit 1; }

# Write a shareable badge
node plugins/ruflo-slopguard/scripts/scan.mjs --dir . --badge-out BADGE.md
```

| Exit | Meaning |
|---|---|
| `0` | aggregate slop ≤ threshold (pass) |
| `1` | aggregate slop > threshold (gate failed) |
| `2` | usage error |

## The four rules (higher slop = worse)

| Rule | Catches | Max penalty |
|---|---|---|
| **Echo comments** | comment restating the code line beneath it | 24 |
| **Filler identifiers** | declarations named `tmp`/`val`/`foo`/`result`/… | 20 |
| **Duplicate bloat** | file dominated by repeated identical lines | 20 |
| **Unused imports** | `import { x }` where `x` never used (TS/JS) | 30 |

## Scoring

- Per-file: `slop = echo + filler + bloat + unused`, clamped 0-100.
- Aggregate: line-count-weighted mean (bigger files count more).
- `quality = 100 − slop` (used by the badge).

## Files

```
plugins/ruflo-slopguard/
├── .claude-plugin/plugin.json   # manifest (name = dir, semver 0.1.0)
├── agents/slopguard-analyst.md  # review agent (verifies before accusing)
├── commands/slopguard.md        # /slopguard scan|check|report|badge|gate
├── skills/slopguard-scan/       # skill driving scripts/scan.mjs
├── scripts/
│   ├── scan.mjs                 # the scanner + CLI (zero-dep Node ESM)
│   ├── smoke.sh                 # contract test (this plugin's gate)
│   └── __tests__/scan.test.mjs  # regression tests (node --test)
└── docs/adrs/0001-slopguard-gate.md
```

## Namespace coordination

SlopGuard is a pure static-analysis plugin — it does **not** write to any
memory namespace (unlike ruflo-agentdb's `namespace` convention). It reads
files and writes reports to disk or stdout only. If you want scan history,
point `--out` at a git-tracked artifacts dir and let git own the history.

## Development

```bash
# Run the regression tests
node --test plugins/ruflo-slopguard/scripts/__tests__/

# Run this plugin's contract smoke
bash plugins/ruflo-slopguard/scripts/smoke.sh

# Fleet audits (from repo root)
node scripts/audit-plugin-manifest.mjs --only ruflo-slopguard
node scripts/audit-skill-frontmatter.mjs --only ruflo-slopguard
```

## License

MIT. See the parent repository license.
