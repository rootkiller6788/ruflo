---
status: Proposed
---

# ADR-0001: TodoDebt — deterministic tech-debt marker gate

- **Deciders**: fork owner (rootkiller6788)
- **Date**: 2026-08-25

## Context

When an agent ships a feature, it leaves breadcrumbs — `TODO`, `FIXME`, `HACK`,
`XXX`, `TEMP` — that no linter, type-check, or test fails on. They accumulate
invisibly until "we'll fix it later" becomes "we no longer remember why this
exists". 2026's agentic-coding wave accelerates this: more code is generated,
and generated code carries more of these markers than hand-written code does.

Existing tooling (lint, coverage) is blind to marker debt. This plugin adds a
deterministic, zero-dependency static gate that turns that drift into a number.

## Decision

Ship a self-contained plugin `ruflo-todo-debt` whose `scripts/scan.mjs`
detects five marker types, weights each by severity, and sums the aggregate
"debt":

| Marker | Severity |
|---|---|
| `FIXME` | 3 |
| `HACK` | 2 |
| `XXX` | 2 |
| `TODO` | 1 |
| `TEMP` | 1 |

Design constraints (load-bearing):

- **Zero dependencies** — pure `node:fs`/`node:path`, no npm install, works
  offline and in any CI.
- **Cross-platform** — Node ESM only, no bash/shell pipelines; runs on Windows
  natively.
- **Deterministic** — same input, same total. No LLM in the loop; the analyst
  *agent* triages the output but never generates it.
- **CI-friendly** — exit 1 when total debt exceeds `--threshold` (default 50);
  `--json` for machine consumption.
- **Word-boundary matching** — `TODO`/`todo`/`Todo` all hit, `TODOABLE` does
  not.

## Consequences

- Debt becomes measurable and gate-able in one CI line.
- Severity weighting means a single `FIXME` (3) outranks three `TODO`s (1),
  guiding triage toward what actually hurts.
- Trade-off: marker matching is textual, so a `TODO` inside a string literal or
  a roadmap bullet is still counted. The analyst agent cross-checks before
  accusing; future refinements can add comment-context awareness while keeping
  the deterministic + zero-dep bar.
