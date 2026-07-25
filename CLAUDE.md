# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Quick start

```bash
./scripts/bootstrap.sh    # THE GATE — must end GREEN before any lane launches
```

There is no `package.json` in the repo yet — the Next.js scaffold happens at hour 0. `bootstrap.sh` scaffolds it, installs only the frozen stack, wires Vitest, appends the design tokens, and runs the keystone test. Idempotent; safe to re-run. It never touches `lib/contracts.ts`, `fixtures/`, `docs/` or the README.

After bootstrap, `pnpm test` works normally.

The keystone test (`lib/__tests__/contract.test.ts`) validates the entire contract against `fixtures/margaret.json`. It is the first quality gate at hour 0 and the first thing the orchestrator checks in every merge window. If it fails, every lane is building against a lie.

---

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run all tests (vitest). Contract, unit, and integration tests. Must be green before merging. |
| `pnpm test -- lib/` | Run tests in a specific directory |
| `pnpm test -- --reporter=verbose` | Run with verbose output for debugging |
| `pnpm test:watch` | Watch mode |
| `pnpm typecheck` | `tsc --noEmit` |
| `./scripts/bootstrap.sh` | Hour 0: scaffold + frozen stack + gate. Run once, by the orchestrator, on `main`. |
| `./scripts/db-push.sh` | Apply schema + RLS. Lanes A and D only. Reminds you to enable anonymous sign-ins. |
| `./scripts/verify.sh` | **Run before every PR.** Contract unmodified, no judgement fields, no urgency language in components, types and tests green, changes confined to one lane. |

Before `bootstrap.sh` runs, the repo is contract + fixtures + docs only — there is no `package.json`, so `pnpm` commands will fail. Lanes add the frontend, API and detectors as they build.

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
| **A** | Pipeline | `lib/ai/**`, `app/api/**`, `supabase/migrations/0002+` (additive only) | Yes | Yes | `docs/lanes/lane-a-pipeline.md` |
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

Note `priority` is legal as a **CHC level value** (`ChcLevel`), because it is one of the levels on the official Decision Support Tool. What is banned is a judgement **field**. `scripts/verify.sh` enforces the distinction.

**The CHC level data is verified, not guessed.** `CHC_DOMAIN_LEVELS` came from the DST guidance (October 2022, pp.59–61). Three domains cap at High — continence, communication, psychological and emotional needs — and altered states of consciousness skips Severe entirely while still reaching Priority. Three of these were wrong before verification. Do not "correct" them.

### The fixture

`fixtures/margaret.json` is a full `CaseSnapshot`: **4 sources, 17 claims, 10 facts, 1 conflict, 4 gaps, and both phase-1 artefacts.** Lanes B and C build every screen from this fixture alone, with no API key and no database. When Lane A lands real extraction, an import changes and tests pass without any other edit.

Three things in it are deliberate and must not be "cleaned up":

- **One claim has `verified_substring: false`** — a quote that is not in its source. It exercises the drop path, and `stats` reads 17 extracted / 1 dropped so the UI has a real number to render.
- **One fact is superseded** — the March cardiology instruction has `valid_to` set and `superseded_by` pointing at the disputed June fact. Stretch S6 has something to render on day one.
- **One artefact assertion is empty** — the CHC continence slot has no facts and no text, so Lane B must build the `gap_prompt` fall-through rather than discovering it later.

Verified: all 16 verified quotes are literal substrings of their sources, zero dangling references.

### The templates

`fixtures/templates.json` holds the two phase-1 `ArtifactTemplate` rows — `chc_dst_pack_v1` (31 slots across all 12 DST domains plus cover and method) and `gp_brief_v1` (8 slots).

**Templates are data, not code.** Lane A reads this file to know what to fill; Lane B reads it to know what to lay out; Lane D seeds `artifact_templates` from it. Nobody hardcodes a slot list, and nobody writes template SQL by hand.

`lib/__tests__/templates.test.ts` enforces it. The load-bearing assertion is the cross-check: every `slot_key` used by an artefact in `margaret.json` must exist in its template. Without it, Lane A can fill slots Lane B never renders and neither notices until integration.

If a lane needs a slot that does not exist, that is a template change — it goes in the PR description, not into the file.

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
| **Testing what you built** | `docs/user-journey.md` — 9 click-and-tick journeys, lane-attributed. This is how the orchestrator reviews. |
| **Understanding data sources and CHC** | `docs/data-sources.md` — real test documents plus framework citations verified against primary sources |
| **Deciding what to build if you finish early** | `docs/implementation-plan.md` §7b — eight ranked stretch goals with owners |

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
