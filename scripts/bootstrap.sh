#!/usr/bin/env bash
#
# Verity — hour 0, one command.
#
# Scaffolds Next.js, installs the frozen stack, wires Vitest, and runs the
# keystone test. Does NOT touch anything already in the repo: your docs,
# lib/contracts.ts, fixtures, and migrations are left exactly as they are.
#
# Safe to re-run. If package.json already exists it skips the scaffold.
#
# Usage:  ./scripts/bootstrap.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m\xe2\x9c\x93\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\033[31m\xe2\x9c\x97 %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- 1. checks
bold "1/6  Prerequisites"

command -v node >/dev/null || die "node not found"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "node 20+ required, found $(node -v)"
ok "node $(node -v)"

command -v pnpm >/dev/null || die "pnpm not found. Install with: npm i -g pnpm"
ok "pnpm $(pnpm -v)"

[ -f lib/contracts.ts ]        || die "lib/contracts.ts missing — wrong directory?"
[ -f fixtures/margaret.json ]  || die "fixtures/margaret.json missing"
ok "contract and fixture present"

# ------------------------------------------------------------- 2. scaffold
bold "2/6  Next.js scaffold"

if [ -f package.json ]; then
  warn "package.json exists — skipping scaffold"
else
  # create-next-app refuses to run in a directory containing README.md or
  # .gitignore, so scaffold in a temp dir and copy the parts we want.
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  pnpm create next-app@latest "$TMP/app" \
    --typescript --tailwind --app --eslint \
    --no-src-dir --use-pnpm --skip-install --yes >/dev/null

  # Copy generated config + app shell. Never overwrite our own files.
  for f in package.json tsconfig.json next.config.ts next.config.mjs next.config.js \
           postcss.config.mjs postcss.config.js tailwind.config.ts \
           eslint.config.mjs .eslintrc.json next-env.d.ts; do
    [ -f "$TMP/app/$f" ] && [ ! -f "$f" ] && cp "$TMP/app/$f" .
  done
  [ -d "$TMP/app/app" ]    && [ ! -d app ]    && cp -R "$TMP/app/app" .
  [ -d "$TMP/app/public" ] && [ ! -d public ] && cp -R "$TMP/app/public" .

  ok "scaffolded (our README, .gitignore, docs and lib left untouched)"
fi

# ---------------------------------------------------------- 3. frozen stack
bold "3/6  Frozen stack"

# Anything not listed in docs/stack-freeze.md does not get installed.
pnpm add zod @anthropic-ai/sdk @supabase/supabase-js @supabase/ssr >/dev/null
ok "runtime: zod, anthropic-sdk, supabase-js, supabase/ssr"

pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths \
  @testing-library/react @testing-library/jest-dom jsdom >/dev/null
ok "dev: vitest, testing-library, jsdom"

# ---------------------------------------------------------------- 4. vitest
bold "4/6  Test harness"

if [ ! -f vitest.config.ts ]; then
  cat > vitest.config.ts <<'EOF'
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
  },
});
EOF
  ok "vitest.config.ts"
else
  warn "vitest.config.ts exists — left alone"
fi

# Patch scripts + strict TS without clobbering anything else.
node - <<'EOF'
const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts = Object.assign({}, pkg.scripts, {
  test: 'vitest run',
  'test:watch': 'vitest',
  typecheck: 'tsc --noEmit',
  verify: 'pnpm typecheck && pnpm test',
});
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

if (fs.existsSync('tsconfig.json')) {
  const raw = fs.readFileSync('tsconfig.json', 'utf8');
  // tsconfig may contain comments; only patch when it parses cleanly.
  try {
    const ts = JSON.parse(raw);
    ts.compilerOptions = Object.assign({}, ts.compilerOptions, {
      strict: true,
      noUncheckedIndexedAccess: true,
      resolveJsonModule: true,
    });
    fs.writeFileSync('tsconfig.json', JSON.stringify(ts, null, 2) + '\n');
    console.log('  tsconfig: strict, noUncheckedIndexedAccess, resolveJsonModule');
  } catch {
    console.log('  ! tsconfig.json has comments — set strict + resolveJsonModule by hand');
  }
}
EOF
ok "scripts: test, typecheck, verify"

# ------------------------------------------------------------ 5. env + tokens
bold "5/6  Environment and design tokens"

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  warn ".env.local created from template — fill it in (lanes B and C can leave it empty)"
else
  ok ".env.local exists"
fi

# Design tokens go in now so Lane B starts from the real palette rather than
# Tailwind defaults. Values are from docs/design.md §3.
if [ -f app/globals.css ] && ! grep -q -- '--color-paper' app/globals.css; then
  cat >> app/globals.css <<'EOF'

/* ---------------------------------------------------------------
   Verity design tokens — docs/design.md §3-4.
   Emergency red is reserved for the 999 card and banner ONLY.
   --------------------------------------------------------------- */
:root {
  --color-paper: #FAF7F2;
  --color-surface: #FFFFFF;
  --color-ink: #1C1B1A;
  --color-ink-secondary: #55504A;
  --color-hairline: #E7E1D8;
  --color-brand: #14453D;

  --color-cite-fill: #E4EFEC;
  --color-cite-border: #A9C9C2;
  --color-cite-text: #14453D;

  --color-unverified-fill: #FBEADD;
  --color-unverified-border: #E8B98C;
  --color-unverified-text: #9A4A15;

  --color-conflict-fill: #FFF4D6;
  --color-conflict-border: #E0B94A;
  --color-conflict-text: #7A5C05;

  --color-emergency: #B3261E;
  --color-emergency-fill: #FDEDEC;
}

html { font-size: 18px; }
@media (max-width: 480px) { html { font-size: 20px; } }

body {
  background: var(--color-paper);
  color: var(--color-ink);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 100ms !important;
    transition-duration: 100ms !important;
  }
}
EOF
  ok "design tokens appended to app/globals.css"
fi

# ------------------------------------------------------------------ 6. gate
bold "6/6  The gate"

if pnpm test; then
  printf '\n\033[32m\xe2\x9c\x93 GREEN \xe2\x80\x94 the contract holds.\033[0m\n\n'
  bold "Next"
  echo "  1. Commit:  git add -A && git commit -m 'chore: scaffold' && git push"
  echo "  2. Protect main on GitHub (Settings -> Branches)"
  echo "  3. Apply the schema:  ./scripts/db-push.sh"
  echo "  4. Launch lanes:      docs/launch-prompts.md"
else
  printf '\n\033[31m\xe2\x9c\x97 RED \xe2\x80\x94 do NOT launch lanes.\033[0m\n'
  echo "Every lane would build against a lie. Fix the keystone test first."
  exit 1
fi
