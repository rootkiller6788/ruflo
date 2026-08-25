#!/usr/bin/env bash
# Structural smoke test for ruflo-slopguard v0.1.0 (ADR-0001).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
step() { printf "→ %s ... " "$1"; }
ok()   { printf "PASS\n"; PASS=$((PASS+1)); }
bad()  { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

# 1. plugin.json declares 0.1.0 with required keywords
step "1. plugin.json declares 0.1.0 with keywords"
v=$(grep -E '"version"' "$ROOT/.claude-plugin/plugin.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [[ "$v" != "0.1.0" ]]; then
  bad "expected 0.1.0, got '$v'"
else
  miss=""
  for k in slop anti-slop quality ci code-quality; do
    grep -q "\"$k\"" "$ROOT/.claude-plugin/plugin.json" || miss="$miss $k"
  done
  [[ -z "$miss" ]] && ok || bad "missing keywords:$miss"
fi

# 2. slopguard-scan skill present with valid frontmatter
step "2. skills/slopguard-scan/SKILL.md has name/description/allowed-tools"
F="$ROOT/skills/slopguard-scan/SKILL.md"
miss=""
[[ -f "$F" ]] || miss="$miss missing-file"
for k in 'name:' 'description:' 'allowed-tools:'; do
  grep -q "^$k" "$F" 2>/dev/null || miss="$miss no-$k"
done
[[ -z "$miss" ]] && ok || bad "$miss"

# 3. command covers all 5 subcommands
step "3. /slopguard command covers all 5 subcommands"
F="$ROOT/commands/slopguard.md"
miss=""
for sub in 'slopguard scan' 'slopguard check' 'slopguard report' 'slopguard badge' 'slopguard gate'; do
  grep -q "$sub" "$F" || miss="$miss '${sub#slopguard }'"
done
[[ -z "$miss" ]] && ok || bad "missing:$miss"

# 4. agent references REFERENCE.md (token-optimization pattern)
step "4. agent references REFERENCE.md"
grep -q "REFERENCE.md" "$ROOT/agents/slopguard-analyst.md" \
  && ok || bad "REFERENCE.md cross-reference missing"

# 5. skill invokes scripts/scan.mjs
step "5. skill drives scripts/scan.mjs"
grep -q "scripts/scan\.mjs" "$ROOT/skills/slopguard-scan/SKILL.md" \
  && ok || bad "skill does not invoke scan.mjs"

# 6. README pins @claude-flow/cli v3.6
step "6. README pins @claude-flow/cli to v3.6"
grep -qE "@claude-flow/cli.*v3\.6|v3\.6.*claude-flow/cli" "$ROOT/README.md" \
  && ok || bad "Compatibility pin to v3.6 missing"

# 7. ADR file exists with status Proposed
step "7. ADR-0001 exists with status Proposed"
ADR="$ROOT/docs/adrs/0001-slopguard-gate.md"
[[ -f "$ADR" ]] && grep -qE "^status:[[:space:]]*Proposed" "$ADR" \
  && ok || bad "ADR missing or status != Proposed"

# 8. REFERENCE.md exists and is non-empty
step "8. REFERENCE.md exists and is non-empty"
[[ -s "$ROOT/REFERENCE.md" ]] && ok || bad "REFERENCE.md missing or empty"

# 9. No wildcard tool grants
step "9. no skill grants wildcard tool access"
bad_skills=""
for f in "$ROOT"/skills/*/SKILL.md; do
  grep -q '^allowed-tools:[[:space:]]*\*' "$f" && bad_skills="$bad_skills $(basename "$(dirname "$f")")"
done
[[ -z "$bad_skills" ]] && ok || bad "wildcard:$bad_skills"

# 10. scan.mjs present, executable, syntax-clean
step "10. scripts/scan.mjs executable + syntax-clean"
F="$ROOT/scripts/scan.mjs"
miss=""
[[ -x "$F" ]] || miss="$miss not-executable"
node --check "$F" 2>/dev/null || miss="$miss syntax-error"
[[ -z "$miss" ]] && ok || bad "$miss"

# 11. scanner runs and reports a score
step "11. scanner runs against a live fixture"
OUT=$(node "$ROOT/scripts/scan.mjs" --dir "$ROOT" --json --threshold 0 2>/dev/null || true)
echo "$OUT" | grep -q '"aggregateSlop"' \
  && ok || bad "scan.mjs did not produce aggregateSlop"

# 12. regression tests exist and pass
step "12. node --test regression suite passes"
TEST_DIR="$ROOT/scripts/__tests__"
test_count=$(find "$TEST_DIR" -maxdepth 1 -name '*.test.mjs' 2>/dev/null | wc -l | tr -d ' ')
[[ "$test_count" -ge 1 ]] && node --test "$TEST_DIR"/*.test.mjs >/dev/null 2>&1 \
  && ok || bad "contract tests failed (run: node --test $TEST_DIR/*.test.mjs)"

printf "\n%s passed, %s failed\n" "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]] || exit 1
