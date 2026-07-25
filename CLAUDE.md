# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Quick start

```bash
pnpm install
pnpm test          # THE GATE — must pass before any lane launches
```

The keystone test (`lib/__tests__/contract.test.ts`) validates the entire contract against `fixtures/margaret.json`. It is the first quality gate at hour 0 and the first thing the orchestrator checks in every merge window. If it fails, every lane is building against a lie.

---

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run all tests (vitest). Contract, unit, and integration tests. Must be green before merging. |
| `pnpm test -- lib/` | Run tests in a specific directory |
| `pnpm test -- --reporter=verbose` | Run with verbose output for debugging |
| `pnpm test:watch` | Watch mode (if configured in package.json) |

No build, lint, or dev server commands currently exist — the codebase is a pure contract + fixtures repo at hour 0. Lanes add Next.js frontend, backend API, and CLI tools as they build.

---

## The architecture — parallel build across lanes

**Read first:** `prd.md` §3 (the demo), then `docs/contract-spec.md` and `docs/stack-freeze.md`.

### Core principle: contract first, then nobody waits

1. **Contract is frozen at hour 0** (`lib/contracts.ts`). Every lane codes against it. No lane codes against another lane's output.
2. **Territory ownership prevents conflicts.** Lanes own *directories*, exclusively. Two agents never edit the same file. See `docs/implementation-plan.md` §2.
3. **Tests are the code review.** Correctness is proven by CI (typecheck + contract test); behaviour is proven by visual preview. A PR with a red check is not reviewed.

### The five lanes

| Lane | Owner | Territory | Needs API? | Needs DB? | Brief |
|------|-------|-----------|------------|-----------|-------|
| **A** | Pipeline | `lib/ai/**`, `app/api/**`, `supabase/migrations/*` | Yes | Yes | `docs/lanes/lane-a-pipeline.md` |
| **B** | Surface | `app/(app)/**`, `components/**`, `app/globals.css`, PWA manifest/icons | No | No | `docs/lanes/lane-b-surface.md` |
| **C** | Safety & detectors | `lib/safety/**`, `lib/detectors/**`, `lib/copy/**` | No | No | `docs/lanes/lane-c-safety.md` |
| **D** | Integrator & demo | `demo/**`, `scripts/**`, `.github/**`, `vercel.json`, service worker | Yes | Yes | `docs/lanes/lane-d-integrator.md` |
| **E** | Voice & channels | `lib/voice/**`, `app/api/voice/**` | Yes | Yes | `docs/lanes/lane-e-voice.md` |

Lanes B and C need nothing but the repo — they can start the instant the contract lands and cannot be blocked.

### The frozen contract

`lib/contracts.ts` defines:
- **CaseSnapshot** — the root data structure
- **CHC domains** and **levels** (verified against NHS Decision Support Tool; three domain ceilings are intentionally different from what you'd guess)
- **SourceKind**, **Provenance**, **DatePrecision**, **AccessBasis** enums
- All claim, fact, conflict, gap, artifact, and assertion types

**Critical structural constraint:** There is no `severity`, `urgency`, `priority`, `rank`, `risk`, or `score` field anywhere in this contract, at any nesting level, now or ever. The model cannot express a clinical judgement because there is nowhere to put one. This is the primary regulatory control and it is structural, not advisory.

### The fixture

`fixtures/margaret.json` is a full `CaseSnapshot` (a synthetic case with ~30 documents, ~200 claims, conflicts, gaps, and both template artifacts). Lanes B and C build every screen from this fixture alone, with no API key and no database. When Lane A lands real extraction, imports change and tests pass without any other edits.

---

## Stack

**Frozen at hour 0. No `pnpm add` without orchestrator approval.**

| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | Node 22 | matches all machines |
| Package manager | **pnpm** | lockfile is committed (no version drift across machines) |
| Framework | Next.js (App Router) | latest stable at hour 0, then frozen |
| Language | TypeScript `strict: true` | `any` and `as` are banned; use `unknown` + Zod parse |
| Validation | **Zod** | contract uses Zod; it is the source of truth |
| Styling | **Tailwind only** | no component library; bespoke design system in `prd.md` §10 |
| Database | `@supabase/supabase-js` + `@supabase/ssr` | anonymous sign-in; SSR client pattern |
| AI | `@anthropic-ai/sdk` raw | forced strict tool use, no abstraction layer |
| Tests | **Vitest** + Testing Library | faster than Jest, ESM-native |
| CI | GitHub Actions | typecheck → test → Vercel preview |
| Deploy | Vercel (`lhr1`) | keeps functions near Supabase (London) |

### Why certain things are rejected

- **pgvector / RAG:** Corpus fits in one prompt (~60k tokens); full-text search suffices. Chunking breaks citation locators and adds undetectable failure modes.
- **Vercel AI SDK, component libraries, state management, ORMs, analytics:** Fragmentation. One abstraction is debuggable at 3am; two are not.

See `docs/stack-freeze.md` for the full rationale and rejection list.

---

## The rules that are not negotiable

1. **The contract is frozen.** `lib/contracts.ts` changes only with the orchestrator, never during a night shift.
2. **The stack is frozen.** No `pnpm add`. See `docs/stack-freeze.md` for rejected dependencies and why.
3. **Territory is exclusive.** Lanes own directories; two agents never edit the same file. Boundaries in `docs/implementation-plan.md` §2.
4. **No judgement fields.** The structural constraint above — no `severity`, `urgency`, `priority`, `rank`, `risk`, `score`.
5. **Tests are the code review.** Orchestrator reviews via preview URLs. A PR with a red check is not reviewed.
6. **H24 is a hard freeze.** Copy strings and fixture data only after that.

---

## Documentation map

| If you are… | Read |
|---|---|
| **Launching agents** | `docs/launch-prompts.md` — copy-paste, one per machine |
| **An agent on a lane** | `docs/lanes/lane-<a–e>-*.md` — your brief |
| **Understanding the product** | `prd.md` — start with §3 (the demo) |
| **Writing any code** | `docs/contract-spec.md` + `docs/stack-freeze.md` |
| **Designing anything** | `docs/design.md`, and open `demo/design-showcase.html` in a browser |
| **Running the orchestrator review loop** | `docs/orchestrator-runbook.md` |
| **Understanding data sources and CHC** | `docs/data-sources.md` and the research directory |

---

## Context-mode routing

This repo uses `context-mode` MCP tools to protect your context window. CLAUDE.md previously documented this — those rules still apply. Key redirections:

- **Bash >20 lines output:** Use `ctx_batch_execute(commands, queries)` instead
- **Grep with large results:** Use `ctx_execute(language: "shell", code: "...")` to run in sandbox
- **File analysis:** Use `ctx_execute_file(path, language, code)` instead of Read
- **WebFetch/curl/wget:** Use `ctx_fetch_and_index(url, source)` then `ctx_search(queries)`

See `/caveman` mode toggle at the top of your conversation if you need terse output during development.

---

## Safety

Verity organizes evidence people already hold. It does not assess symptoms, does not diagnose, and does not say how urgent anything is. Emergency detection is a deterministic rule list (see `lib/safety/**`) that runs *before* any model call and halts the pipeline. Urgency judgements are deliberately designed out of the model.

All demo data is synthetic. No real patient data at any point.
