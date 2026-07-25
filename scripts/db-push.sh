#!/usr/bin/env bash
#
# Verity — apply the schema to Supabase.
#
# Only Lanes A and D need this. Lanes B and C never touch the database.
#
# Two routes:
#   supabase CLI  (preferred)  — tracks migrations properly
#   psql          (fallback)   — needs a connection string
#
# Usage:
#   ./scripts/db-push.sh                       # uses the linked project
#   DATABASE_URL=postgres://... ./scripts/db-push.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m\xe2\x9c\x93\033[0m %s\n' "$1"; }
die()  { printf '\033[31m\xe2\x9c\x97 %s\033[0m\n' "$1" >&2; exit 1; }

[ -f supabase/migrations/0001_init.sql ] || die "migration not found — wrong directory?"

bold "Applying supabase/migrations/"

if [ -n "${DATABASE_URL:-}" ]; then
  command -v psql >/dev/null || die "psql not found. Install postgresql, or use the supabase CLI."
  for f in supabase/migrations/*.sql; do
    echo "  -> $f"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  done
  ok "applied via psql"

elif command -v supabase >/dev/null; then
  if [ ! -f supabase/config.toml ]; then
    echo "  No linked project. Run this once, then re-run me:"
    echo "    supabase login"
    echo "    supabase link --project-ref <your-project-ref>"
    exit 1
  fi
  supabase db push
  ok "applied via supabase CLI"

else
  die "Neither DATABASE_URL nor the supabase CLI is available.
  Install the CLI:  brew install supabase/tap/supabase
  Or set a connection string:
    Supabase dashboard -> Project Settings -> Database -> Connection string (URI)
    DATABASE_URL='postgres://...' ./scripts/db-push.sh"
fi

printf '\n'
bold "Now check this in the dashboard — it is the easiest thing to miss"
echo "  Authentication -> Sign In / Providers -> ENABLE Anonymous Sign-Ins"
echo
echo "Without it, Lane A stalls around hour 2 with an auth error that looks like"
echo "an RLS problem and is not one."
