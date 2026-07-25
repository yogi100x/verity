#!/usr/bin/env bash
#
# Verity — the pre-PR check. Run this before opening any pull request.
#
# Checks the invariants that keep three parallel lanes mergeable. CI runs the
# same things, so a green run here means a green check there.
#
# Usage:  ./scripts/verify.sh

#   ./scripts/verify.sh          full: structural checks + typecheck + tests
#   ./scripts/verify.sh --fast   structural checks only (used by the pre-commit hook)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

FAIL=0
bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m\xe2\x9c\x93\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m\xe2\x9c\x97\033[0m %s\n' "$1"; FAIL=1; }

bold "Contract integrity"

# The contract is frozen. An unstaged edit to it is almost always a mistake.
if git diff --quiet HEAD -- lib/contracts.ts 2>/dev/null; then
  ok "lib/contracts.ts unmodified"
else
  bad "lib/contracts.ts MODIFIED — the contract is frozen. Revert, and put the request in your PR description instead."
fi

# The orchestrator's key: ALLOW_FIXTURES=orchestrator ./scripts/verify.sh (or
# prefixed on git commit) lets a deliberate fixture edit through. Every other
# check still runs; lanes are still blocked. Using the key is visible in the
# command you typed and in the commit that results — that visibility is the
# audit trail.
if git diff --quiet HEAD -- fixtures/ 2>/dev/null; then
  ok "fixtures/ unmodified"
elif [ "${ALLOW_FIXTURES:-}" = "orchestrator" ]; then
  ok "fixtures/ modified under ALLOW_FIXTURES=orchestrator (deliberate orchestrator edit)"
else
  bad "fixtures/ MODIFIED — orchestrator only, and never during a night shift."
fi

bold "Banned fields"

# No judgement field may exist anywhere. This is the primary regulatory control.
HITS=$(grep -rInE '\b(severity|urgency|risk_score|priority_level)\b\s*[:?]' \
  --include='*.ts' --include='*.tsx' --include='*.json' \
  lib app components fixtures 2>/dev/null | grep -v node_modules || true)
if [ -z "$HITS" ]; then
  ok "no judgement fields"
else
  bad "judgement field found — the model must have nowhere to express one:"
  echo "$HITS" | sed 's|^|      |'
fi

bold "Language sweep"

# Urgency and likelihood language must not reach the UI. The 999 card and the
# permanent banner are the only exceptions, and they live in lib/copy/.
UI=$(grep -rIlE '\b(urgent|immediately|likely|suggests|consistent with|probably|triage)\b' \
  --include='*.tsx' app components 2>/dev/null | grep -v node_modules || true)
if [ -z "$UI" ]; then
  ok "no urgency or likelihood language in components"
else
  printf '  \033[33m!\033[0m review these — allowed only inside the 999 card:\n'
  echo "$UI" | sed 's|^|      |'
fi

if [ "$FAST" -eq 1 ]; then
  bold "Types and tests"
  printf '  \033[33m\xe2\x80\x93\033[0m skipped (--fast). The pre-push hook runs them.\n'
else
  bold "Types and tests"
  if [ ! -f package.json ]; then
    bad "package.json missing — run pnpm install from the repo root"
  else
    if pnpm typecheck >/dev/null 2>&1; then ok "typecheck"; else bad "typecheck failed — run: pnpm typecheck"; fi
    if pnpm test     >/dev/null 2>&1; then ok "tests";     else bad "tests failed — run: pnpm test"; fi
  fi
fi

bold "Territory"

# Warn when a change spans two lanes' directories — usually a boundary breach.
CHANGED=$(git diff --name-only HEAD 2>/dev/null || true)
count() { echo "$CHANGED" | grep -cE "$1" || true; }
# E is matched before A on purpose: app/api/voice/** belongs to E, the rest of app/api/** to A.
E=$(count '^(lib/voice/|app/api/voice/)')
A=$(echo "$CHANGED" | grep -E '^(lib/ai/|app/api/)' | grep -vcE '^app/api/voice/' || true)
B=$(count '^(app/\(app\)/|app/page\.tsx|app/layout\.tsx|app/globals\.css|app/favicon|components/|public/manifest\.json|public/icons/)')
C=$(count '^lib/(safety|detectors|copy)/')
D=$(count '^(demo/|scripts/|\.github/|vercel\.json|app/demo/|public/sw\.js|lib/modes/)')
SPAN=0
for n in $A $B $C $D $E; do [ "$n" -gt 0 ] && SPAN=$((SPAN+1)); done
if [ "$SPAN" -le 1 ]; then
  ok "changes confined to one lane"
else
  printf '  \033[33m!\033[0m changes span %s lane territories (A:%s B:%s C:%s D:%s E:%s)\n' "$SPAN" "$A" "$B" "$C" "$D" "$E"
  echo "      Only the integrator crosses boundaries. If you are not Lane D, split this."
fi

if [ "$FAIL" -eq 0 ]; then
  printf '\n\033[32m\xe2\x9c\x93 Ready to open a PR.\033[0m\n'
  echo "Remember: the reviewer cannot read code. Say what changed, what to click,"
  echo "what correct looks like, and which user-journey steps should now pass."
else
  printf '\n\033[31m\xe2\x9c\x97 Fix the above before opening a PR.\033[0m\n'
  exit 1
fi
