# Implementation Plan — parallel build across N machines

**Read first:** `prd.md` §3 (the demo), `docs/contract-spec.md`, and `docs/stack-freeze.md`. Everything here serves those.

**Build model.** One human orchestrator (reviews visually, does not read code, does not write code) plus one AI agent per machine. Baseline 3 machines; elastic 2–5.

---

## 1. The three principles that make this parallel

**1. Contract first, then nobody waits.** The contract and `fixtures/margaret.json` exist before any lane starts. Every lane codes against the contract; no lane codes against another lane's output. Lane B builds every screen from fixtures with no API key and no database. When Lane A lands real extraction, Lane B changes an import.

**2. Territory, not tickets.** Lanes own *directories*, exclusively. Two agents never edit the same file. This is what removes merge conflicts — not discipline, but disjoint file sets.

**3. Tests are the code review; you are the product review.** You cannot read diffs, so correctness is proven by CI (typecheck + contract test + unit tests) and behaviour is proven by you clicking a Vercel preview URL. A PR with a red check is not reviewed. A PR with a green check gets 90 seconds of your eyes on the preview.

---

## 2. Territory map — exclusive ownership

| Path | Owner | Notes |
|---|---|---|
| `lib/contracts.ts` | **Orchestrator only** | Frozen at hour 0. Branch-protected. |
| `fixtures/**` | **Orchestrator**, then D | Changes only in a merge window |
| `supabase/migrations/**` | Orchestrator (0001), then A | Additive only |
| `lib/ai/**`, `app/api/**` | **Lane A** | Pipeline, extraction, grouping, artefact generation |
| `app/(app)/**`, `components/**`, `app/globals.css` | **Lane B** | Every screen and component |
| `lib/safety/**`, `lib/detectors/**`, `lib/copy/**` | **Lane C** | Pure functions, no I/O |
| `demo/**`, `scripts/**`, `.github/**`, `vercel.json` | **Lane D** | Assets, seed, CI, deploy, replay |
| `lib/voice/**`, `app/api/voice/**` | **Lane E** | Browser capture, then telephony webhook |
| `app/page.tsx`, `app/layout.tsx`, `app/favicon.ico` | **Lane B** | The scaffold's placeholder `app/page.tsx` becomes the landing page |
| `public/manifest.json`, `public/icons/**` | **Lane B** | PWA manifest, icons, install prompt |
| `lib/modes/**` | **Lane D** | The `?mode=live\|fixtures\|replay` switch. Lane A calls model + DB **only through this wrapper** — that is the seam that lets D own the modes without touching A's files. |
| `package.json`, lockfile, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.husky/**`, `lib/__tests__/**` | **Orchestrator** (D on request) | Infra. Any lane needing a change writes it in the PR description. |
| `public/sw.js`, service-worker registration | **Lane D** | Caching strategy — must not break `?mode=` switching |
| `docs/**` | Anyone, append-only | Never delete another lane's notes |

If a lane needs a change outside its territory, it writes the request in its PR description. It does not reach across. Cross-territory edits are the integrator's job.

---

## 3. The lanes

| Lane | Name | Needs API key? | Needs DB? | Brief |
|---|---|---|---|---|
| **A** | Pipeline | Yes | Yes | `docs/lanes/lane-a-pipeline.md` |
| **B** | Surface | **No** | **No** | `docs/lanes/lane-b-surface.md` |
| **C** | Safety & detectors | **No** | **No** | `docs/lanes/lane-c-safety.md` |
| **D** | Integrator & demo | Yes | Yes | `docs/lanes/lane-d-integrator.md` |
| **E** | Voice & channels | Yes | Yes | `docs/lanes/lane-e-voice.md` — runs with a 4th or 5th machine |

**If Lane E never launches** (3 machines): browser voice capture — phase-1 scope — falls back to **A + B**: Lane A builds `app/api/voice/upload` (store recording, create the `Source` row); Lane B adds the mic-record button that posts to it. The Twilio phone number is then cut, not inherited.

B and C need nothing but the repo. That's deliberate: they can start the instant the contract lands, and they can't be blocked by anything.

---

## 4. Launch table — pick by machine count

| Machines | Run | Notes |
|---|---|---|
| **2** | A, B | C's detectors fold into B's machine as a second session after H12. D runs on the orchestrator's laptop during merge windows only. Cut: well-managed detector becomes a manual toggle. |
| **3** (baseline) | A, B, C | D time-shares whichever machine is free at each merge window. This is the plan below. |
| **4** | A, B, C, D | D gets a dedicated machine and runs continuously — fixtures recorder, CI, replay mode, deploy. Best configuration. |
| **5** | A, B, C, D + E | E = voice & channels: browser mic capture first (ships regardless), then the inbound phone number stretch. Also owns evals and demo assets if capacity allows. Touches only `lib/voice/**` and `app/api/voice/**`. |

**Do not exceed 5.** The ceiling isn't compute, it's you — four PRs per review window is already at the limit of a 90-second-per-PR visual check.

**Collapse order if you lose a machine:** drop E, then fold D into the orchestrator, then fold C into B. Never drop A or B — they are the demo.

---

## 5. Hour-by-hour

Merge windows are aligned to your 3–4 hour review cadence. **At every window: lanes stop, D merges, you run `docs/user-journey.md`, lanes resume.**

### H0–0.5 — Orchestrator alone, no agents

Supabase project (London / eu-west-2), **anonymous sign-in enabled**. GitHub repo created, `main` protected. `lib/contracts.ts`, `0001_init.sql`, `fixtures/margaret.json` typed and committed. Vercel project linked. Anthropic key in Vercel env and in each machine's `.env.local`.

> **Gate:** `pnpm test` green on the fixture-conforms-to-contract test. Do not launch lanes until it is.

### H0.5 — Launch

Each machine: clone, `pnpm i`, open Claude Code, paste its lane brief. Lanes create `lane/a`, `lane/b`, `lane/c`, `lane/d` and work only there.

### H0.5–H4 — Window 1

- **A** — extraction spike in isolation: one real PDF → Claims with quotes and page numbers. No UI, no DB. Proves the riskiest thing first.
- **B** — app shell, design tokens, `<ProvenanceTag>`, timeline rendering **entirely from fixtures**.
- **C** — `red_flags.ts` with all 14 rules and the negation guard, fully unit-tested.
- **D** — CI (typecheck + test + preview deploy on every PR), `/demo/reset`.

> **Window 1 review:** Journey 0 passes. Timeline renders from fixtures with working citation chips. Chest-pain string halts with no model call.

### H4–H8 — Window 2

- **A** — **substring kill switch** and the drop counter. Deterministic claim grouping. Persist to Supabase.
- **B** — upload UI, source list, conflict card (still fixture-fed), gap panel.
- **C** — the five deterministic gap detectors, unit-tested against fixtures.
- **D** — fixtures recorder: every live model response written to `fixtures/recorded/<sha256>.json`; `?mode=` switching works.

> **Window 2 review:** Journey 1 steps 1.1–1.11 pass. A live upload produces cited claims. Drop counter visible.

### H8–H12 — Window 3 · **the demo beat**

- **A** — conflict detection + generated question. This is the money moment; it lands here, not later.
- **B** — conflict card wired to real data, audio chip playing, source-at-page deep links.
- **C** — output filter over every generated string; well-managed-need detector with **pre-written citation ids only**.
- **D** — seed Margaret fully; `replay` mode end to end.

> **Window 3 review:** Journey 1 through step 1.18. The furosemide conflict card works with three clickable chips. **If this isn't green by H12, cut the CHC pack and ship discharge-only** — decision point, take it.

### H12–H16 — Window 4

- **A** — artefact generation. `chc_dst_pack_v1` then `gp_brief_v1`. Second template must be a seed row plus a renderer, **not** new pipeline code — if it isn't, the abstraction failed and the pitch claim is false.
- **B** — both artefact views, review-gate checkbox, print stylesheet.
- **C** — consent declaration, access-basis badge, revocation, compliance copy wired everywhere.
- **D** — blind gap test: documents nobody on the team wrote, scored against a sealed answer key.

> **Window 4 review:** Journeys 1, 2, 4, 6. Both artefacts generate from one Fact store.

### H16–H20 — Window 5 · hardening only, no new features

Empty states, error states on every generation, loading skeletons, mobile, keyboard, 200% zoom. D records the backup video **now, while the wifi is fast**. C runs the full language sweep.

> **Window 5 review:** Journeys 3, 5, 7. Cold start → printed brief in under 4 minutes.

### H20–H24 — Window 6 · polish and rehearsal

Copy, spacing, the one screen that carries the demo. You rehearse the three minutes aloud, twice, timed. Lanes fix only what rehearsal exposes.

### H24 — **FREEZE**

After this: copy strings and fixture data only. No new features, no refactors, no "quick fixes." Agents that want to keep building are told to stop — this is the single most valuable rule in the plan and it will feel wrong at the time.

### H24–H28 — Submission

README with architecture diagram, the Claude features used and why, the Supabase features used with a link to the RLS policy file, the eval table including the case it got wrong. Public repo. Deck. Compliance artefacts (DPIA-lite, hazard log, module-boundary diagram).

### H28–H30 — Zero code

Rehearse twice more. Backup video in a second tab. Pre-warm the prompt cache every four minutes while queuing. Eat.

---

## 6. Night shift rules

Apply whenever you're asleep or away for more than an hour:

1. **No merges to `main`.** Lanes commit to their own branch and open PRs that wait.
2. **Contract frozen absolutely.** No unfreeze while you're out — a contract change desynchronises every lane at once.
3. **Territory only.** No cross-lane edits, no "I noticed X was broken so I fixed it."
4. **Queued work must be independent.** Each lane's brief lists its night-shift backlog: work that cannot block on another lane.
5. **Stop-on-ambiguity.** An agent that hits a genuine decision stops, writes the question in its PR, and moves to the next backlog item. It never guesses on a product decision.

---

## 7. Definition of done, per PR

A lane may open a PR only when all of these hold. This list is in every brief.

- `pnpm typecheck` passes
- `pnpm test` passes, including the fixture-conforms-to-contract test
- New behaviour has a test that would fail without the change
- Vercel preview deploys successfully
- PR description written **for a non-coder**: what changed, what to click, what correct looks like, which user-journey steps it should make pass
- No file outside the lane's territory is touched

---

## 7b. Stretch goals — only when your window-5 work is green

**The rule: nothing here starts before H16, and nothing here starts while any Journey 1 step is failing.** A stretch goal that destabilises the demo has negative value.

Also worth saying plainly: if A/B/C land early, the highest-value use of the time is **rehearsal and polish on the two screens that carry the demo**, not another feature. Take these in order and stop the moment H24 arrives.

| # | Stretch | Owner | Hours | Start after | Test |
|---|---|---|---|---|---|
| **S1** | **Maya coda** — second account, self-serve, first-person copy | **B** (+D seed) | 1 | H16 | Journey 9.1–9.3 |
| **S2** | **Compliance artefacts** — DPIA-lite, hazard log, boundary diagram | **C** | 2 | H16, parallel | Journey 9.4 |
| **S3** | **Gap → request letter** | **C** (+B button) | 1.5 | S2 | Journey 9.5–9.7 |
| **S4** | **Attendance Allowance line** | **C** | 0.75 | S3 | Journey 9.8–9.9 |
| **S5** | **Published eval numbers** | **D** | 1 | H16 | Journey 9.10 |
| **S6** | **Supersession** — strike through superseded instructions | **A** (+B visual) | 2 | S1 | Journey 9.11–9.12 |
| **S7** | **Third template** — discharge pack | **A** (+D seed) | 3 | S6 | Journey 9.13–9.14 |
| **S8** | **Voice / Twilio webhook** | **E** or **A** | 2 | last | Journey 9.15 |

### Recommended order, and why

**S1 → S2 → S3 → S4** is about 5 hours, spread across two lanes that can work simultaneously (B on S1, C on S2–S4), and **none of it touches the pipeline**. That is the whole point: maximum pitch value, zero risk to the thing that already works.

Only then consider S6 and S7, which do touch Lane A and therefore carry real regression risk. **S7 is also a design test**: if adding a third template needs pipeline changes rather than a seed row plus a renderer, the `ArtifactTemplate`-as-data abstraction has failed and the central pitch claim is false. Better to discover that at H20 than on stage — but if it happens, stop and revert rather than fixing it.

S8 is last because voice is the most cuttable thing in the build and it competes directly with rehearsal time.

### Hard stop

Everything above is subordinate to the H24 freeze. A frozen demo rehearsed six times beats a richer one rehearsed twice. If a stretch goal is half-finished at H24, **revert it** — do not ship it disabled, do not leave dead UI behind.

---

## 8. Phases beyond the weekend

| Phase | What | Cost |
|---|---|---|
| 1 | Engine, conflict card, CHC pack, GP brief | This weekend |
| 2 | `discharge_pack_v1` | One template row, one renderer, seed data. No engine change. |
| 3 | Self-serve (Maya) | A `care_relationships` row with `role='self'` + first-person copy. No engine change. |
| 4 | `aa1_narrative_v1` (Attendance Allowance) | Template row + deterministic rules pass. Strongest revenue bolt-on. |

If phases 2–4 need engine changes, the `ArtifactTemplate`-as-data design failed and the central pitch claim is false. Treat that as a design bug, not a scope item.
