---
status: Proposed
---

# ADR-0001: SlopGuard — deterministic anti-slop quality gate

- **Deciders**: fork owner (rootkiller6788)
- **Date**: 2026-08-25

## Context

2026's agentic-coding wave means most new code is at least partially
model-generated. The industry counter-trend ("anti-slop") is about catching
low-substance output: comments that restate the code they sit on, filler
identifiers, repeated boilerplate, and imports that are never used. These
patterns don't fail type-checks — they fail humans.

Most existing quality tooling (lint, type-check, test coverage) is blind to
this. This plugin adds a deterministic, zero-dependency static gate that scores
"how much slop is in this file".

## Decision

Ship a self-contained plugin `ruflo-slopguard` whose `scripts/scan.mjs`
implements four deterministic detectors and scores each file 0-100:

1. **Echo comments** — a comment whose token set overlaps the adjacent code
   line (Jaccard ≥ 0.5) with ≥ 2 comment tokens.
2. **Filler identifiers** — declarations named from a small stoplist
   (`a`, `b`, `tmp`, `temp`, `foo`, `bar`, `val`, `result`, `data`, …).
3. **Duplicate-block bloat** — file line-duplication ratio above a floor.
4. **Unused imports** — imported identifiers that never appear in the body
   (TS/JS only).

Design constraints (load-bearing):

- **Zero dependencies** — pure `node:fs`/`node:path`, no npm install, works
  offline and in any CI.
- **Cross-platform** — Node ESM only, no bash/shell pipelines; runs on Windows
  natively.
- **Deterministic** — same input, same score. No LLM in the loop; the analyst
  *agent* reviews the output but never generates it.
- **CI-friendly** — exit 1 when aggregate slop exceeds `--threshold` (default
  40); `--json` for machine consumption.
- **Honest about false positives** — the scanner is a signal, not a verdict;
  the agent cross-checks before accusing.

## Consequences

- Newly generated code gets a hygiene score before it merges.
- Gate can be wired into CI in one line.
- Trade-off: the four rules are deliberately narrow to avoid false positives;
  they will miss stylistically-bad-but-structurally-unique code. Future rules
  should keep the deterministic + zero-dep bar.
