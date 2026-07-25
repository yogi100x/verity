# Stack Freeze

**Frozen at hour 0. No lane adds a dependency without the orchestrator's approval.**

The reason is not purity, it's merge cost. Three agents working in parallel who each pick their own test runner, their own component library, or their own Supabase client pattern produce work that cannot be merged — and you find out at the first window, having lost two hours for nothing.

If a lane believes something here is wrong, it says so in its PR description. It does not install anything.

---

## The stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Node 22** | matches all three machines (22.22.3) |
| Package manager | **pnpm**, lockfile committed | you have 11.15. The committed lockfile is what stops version drift across machines — it matters more than the version numbers below |
| Framework | **Next.js, latest stable**, App Router | `pnpm create next-app@latest`. Whatever version that resolves to at hour 0 is the version, forever. Do not upgrade mid-build. |
| Language | **TypeScript, `strict: true`** | `any` is banned — see below |
| Validation | **Zod** | the contract is Zod; nothing else validates |
| Styling | **Tailwind only — no component library** | see rejected list |
| Fonts | **`next/font`** — Fraunces, Public Sans, IBM Plex Mono | all Google Fonts, self-hosted at build, no layout shift |
| Database / auth / storage | **`@supabase/supabase-js` + `@supabase/ssr`** | anonymous sign-in. One client pattern: server components use the SSR client, never the browser client |
| AI | **`@anthropic-ai/sdk`** raw | see rejected list |
| Tests | **Vitest** + Testing Library | faster than Jest, cleaner ESM |
| CI | **GitHub Actions** | typecheck → test → Vercel preview, on every PR |
| Deploy | **Vercel**, region `lhr1` | keeps functions near the London Supabase |
| PWA | **hand-rolled manifest + service worker** | no plugin; Lane D owns the SW (see its brief) |
| PDF | **none** — `window.print()` | a print stylesheet is visually identical and an hour cheaper |

### Test & tooling infrastructure — already installed, approved

These are in `package.json` and are part of the freeze; they are dev-only and never ship:

`@vitejs/plugin-react` · `vite-tsconfig-paths` · `jsdom` · `@testing-library/jest-dom` · `@tailwindcss/postcss` · `husky`

Lane D: a lockfile diff touching only these (or their transitive deps) is expected, not a violation.

**Typings-lag exception, scope:** `@ts-expect-error` with a comment is acceptable where third-party typings lag — SDK beta blocks **and** build-tool version skew (e.g. the vite 7/8 plugin-context mismatch in `vitest.config.ts`). It is never acceptable on product code paths.

**"Latest stable" means latest at hour 0, then frozen.** Run `pnpm create next-app@latest`, commit the lockfile, and never upgrade during the build. A minor version bump at hour 18 is an unforced error.

---

## `any` is banned

The entire parallel build rests on the contract being the shared truth. An `any` at a boundary silently removes that guarantee, and the failure surfaces three lanes away from where it was introduced.

`tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`. If a lane genuinely needs an escape hatch, it uses `unknown` and narrows with a Zod parse — never `any`, never `as` to force a shape.

One exception, documented: SDK typings occasionally lag beta API blocks. There, `@ts-expect-error` **with a comment naming the block** is acceptable. `any` still is not.

---

## Rejected, and why — read this before "helpfully" adding something

### pgvector and RAG — rejected

**The corpus fits in one prompt.** Four to ten documents, ~60k tokens, against a 1M context window. RAG exists to solve "the corpus doesn't fit." That problem does not exist here.

**Retrieval adds an undetectable failure mode.** Our invariant is that every quote is a verified substring of its source. With full-document extraction, a missing claim means the model missed it — and the blind eval measures that. With RAG, a claim can be missing because *the chunk was never retrieved*, which is indistinguishable from "the document doesn't say that." In a CHC claim that means a family silently loses evidence they actually had. That is the worst bug the product can have.

**Chunking breaks locators.** Citations resolve to page plus character offset into the transcript. Chunking re-segments the text and requires mapping back — more surface for the one error that would be fatal on stage (click a citation, land on the wrong page).

**Semantic similarity is the wrong operation.** This pipeline does exhaustive extraction followed by deterministic set operations — group by subject, find incompatible values, compare dates. Complete passes and arithmetic. There is nothing to retrieve.

**And it reads as pattern-matching.** Vector search over four PDFs signals reaching for a familiar shape rather than thinking about the problem, and a Supabase-sponsored judge will ask.

If search is ever needed, **Postgres full-text (`tsvector`) comes first** — exact, free, already present, no embedding drift. pgvector is the step after full-text stops being enough, and the right thing to embed then is structured *facts*, not raw chunks. Phase 5 at the earliest.

### Vercel AI SDK — rejected

We need forced strict tool use, native PDF blocks, `output_config.effort`, and precise control over what reaches the model. One abstraction is debuggable at 3am; two are not. Use the Anthropic SDK directly.

### shadcn/ui and every component library — rejected

The design system is bespoke and specified to hex values in `prd.md` §10. A library's defaults are precisely the templated look `research/01` warned about — a judge has seen it forty times today. Hand-build against the tokens. `<ProvenanceTag>` is the signature component and must not inherit anyone else's opinions.

### State management libraries — rejected

Server components plus URL state plus `useState` covers everything here. No Redux, Zustand, Jotai or React Query.

### ORMs — rejected

The Supabase client is enough. Prisma or Drizzle would add a schema-definition layer competing with `lib/contracts.ts` for authority — exactly the ambiguity the freeze exists to prevent.

### Auth providers, analytics, error trackers, feature flags — rejected

Anonymous sign-in is the auth story. Everything else is post-hackathon.

---

## Adding a dependency

1. Lane writes the request in its PR description: what, why, and what it replaces
2. Orchestrator decides
3. If approved, orchestrator installs it on `main` and tells every lane to rebase

**Never during the night shift.** A lockfile change while you're asleep desynchronises every machine at once.
