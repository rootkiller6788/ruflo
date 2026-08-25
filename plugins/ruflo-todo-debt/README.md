# ruflo-todo-debt

![TodoDebt: 0](https://img.shields.io/badge/todo%20debt-0-brightgreen)

**Tech-debt marker gate for AI-accelerated codebases.** Statically scan code for
`TODO`, `FIXME`, `HACK`, `XXX`, and `TEMP` markers, weight each by severity, and
fail CI when the aggregate "debt" crosses a threshold.

Zero dependencies. Offline. Cross-platform (Windows / macOS / Linux). No LLM in
the loop — deterministic by design; the optional agent only triages the
scanner's output.

> Compatible with `@claude-flow/cli` v3.6+. Load with
> `claude --plugin-dir plugins/ruflo-todo-debt`.

## Why

When an agent ships a feature, it leaves breadcrumbs: `TODO` (nice-to-have),
`FIXME` (known-broken), `HACK`/`XXX` (shortcuts that will bite), `TEMP`
(should never have shipped). These accumulate invisibly — nothing fails a
build for them, so they grow until "we'll do it later" becomes "we don't
remember why this exists". A debt gate turns that drift into a number you can
actually track.

## Quick start

```bash
# Scan the current tree, human-readable
node plugins/ruflo-todo-debt/scripts/scan.mjs --dir .

# CI gate: fail when aggregate debt exceeds 50
node plugins/ruflo-todo-debt/scripts/scan.mjs --dir src --json --threshold 50 \
  || { echo "debt gate failed"; exit 1; }

# Write a shareable badge
node plugins/ruflo-todo-debt/scripts/scan.mjs --dir . --badge-out BADGE.md
```

| Exit | Meaning |
|---|---|
| `0` | total debt ≤ threshold (pass) |
| `1` | total debt > threshold (gate failed) |
| `2` | usage error |

## The five markers (higher severity = more debt)

| Marker | Severity | Meaning |
|---|---|---|
| `FIXME` | 3 | known-broken, needs a fix |
| `HACK` | 2 | works, but by shortcut |
| `XXX` | 2 | dangerous / needs review |
| `TODO` | 1 | planned follow-up |
| `TEMP` | 1 | temporary, should not ship |

`debt = Σ severity` across every marker in the tree.

## Scoring

- Per-file: `debt = Σ marker severity`.
- Aggregate: `totalDebt = Σ file debt` (the whole tree's debt).
- Gate passes when `totalDebt ≤ threshold` (default `50`).

## Files

```
plugins/ruflo-todo-debt/
├── .claude-plugin/plugin.json   # manifest (name = dir, semver 0.1.0)
├── agents/todo-debt-analyst.md  # triage agent (verifies before flagging)
├── commands/todo-debt.md        # /todo-debt scan|check|report|badge|gate
├── skills/todo-debt-scan/       # skill driving scripts/scan.mjs
├── scripts/
│   ├── scan.mjs                 # the scanner + CLI (zero-dep Node ESM)
│   ├── smoke.sh                 # contract test (this plugin's gate)
│   └── __tests__/scan.test.mjs  # regression tests (node --test)
└── docs/adrs/0001-todo-debt-gate.md
```

## Namespace coordination

TodoDebt is a pure static-analysis plugin — it does **not** write to any memory
namespace (unlike ruflo-agentdb's `namespace` convention). It reads files and
writes reports to disk or stdout only. Point `--out` at a git-tracked artifacts
dir to keep a history of debt drift over time.

## Development

```bash
# Run the regression tests
node --test plugins/ruflo-todo-debt/scripts/__tests__/

# Run this plugin's contract smoke
bash plugins/ruflo-todo-debt/scripts/smoke.sh

# Fleet audits (from repo root)
node scripts/audit-plugin-manifest.mjs --only ruflo-todo-debt
node scripts/audit-skill-frontmatter.mjs --only ruflo-todo-debt
```

## License

MIT. See the parent repository license.
