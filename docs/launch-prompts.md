# Launch Prompts — copy, paste, go

**How to use this.** At hour 0.5, on each machine, run the setup block, then paste that machine's prompt into Claude Code as the **first message**. Nothing else. The prompt tells the agent to read its own brief.

Do not paraphrase these. The wording is doing work — territory boundaries, the stop-and-ask rule, and the no-dependency rule are all in there deliberately.

---

## Before any machine launches — the gate

On your own machine only:

```bash
cd verity
./scripts/bootstrap.sh
```

**It must end GREEN.** If the keystone test fails, every lane would build against a lie. Fix it before launching anything. Then:

```bash
git add -A && git commit -m "contract: freeze" && git push
# GitHub → Settings → Branches → protect main
```

---

## Setup, on every machine

```bash
git clone https://github.com/yogi100x/verity.git && cd verity
pnpm install
cp .env.example .env.local     # lanes B and C can leave it empty
git checkout -b lane/<a|b|c>
claude
```

Only the orchestrator runs `bootstrap.sh` — once, on `main`, before any lane clones.

---

## MACHINE 1 — Lane A (Pipeline)

> You are Lane A on the Verity build. Read these four files in full before writing anything: `docs/lanes/lane-a-pipeline.md` (your brief), `prd.md`, `docs/contract-spec.md`, `docs/stack-freeze.md`.
>
> Your territory is `lib/ai/**`, `app/api/**`, and additive migrations `supabase/migrations/0002+`. You must not edit any file outside it — not `lib/contracts.ts`, not `fixtures/**`, not `components/**`, not `lib/safety/**`. If you need a change outside your territory, write the request in your PR description instead of making it.
>
> The stack is frozen. Do not run `pnpm add`. pgvector and RAG are rejected with reasons in the freeze document — read them before concluding otherwise.
>
> Work in this order, and open a PR at each step rather than batching:
> 1. A standalone extraction spike — one real PDF in, Claims with verbatim quotes and page numbers out. No UI, no database. Prove the riskiest thing first.
> 2. The substring kill switch and the drop counter.
> 3. Deterministic claim grouping, then conflict detection with a generated question.
> 4. Artefact generation: `chc_dst_pack_v1`, then `gp_brief_v1`.
>
> Write the tests listed in your brief before the code they test. Every PR must have `pnpm typecheck` and `pnpm test` green, and must build `/api/debug/inspect` so a non-coder can see your lane working — the person reviewing you cannot read code, so your PR description must say what changed, what to click, and what correct looks like.
>
> Two API facts that will each cost you an hour if you rediscover them: the citations API and `output_config.format` are incompatible and return 400, so use forced strict tool use plus your own substring check. And `budget_tokens`, non-default sampling parameters, and assistant-turn prefills all return 400 on Sonnet 5.
>
> If you hit a genuine product decision, stop and write the question in your PR. Do not guess. Start with step 1 now.

---

## MACHINE 2 — Lane B (Surface)

> You are Lane B on the Verity build. Read these five files in full before writing anything: `docs/lanes/lane-b-surface.md` (your brief), `docs/design.md`, `prd.md`, `docs/user-journey.md`, `docs/stack-freeze.md`. Then open `demo/design-showcase.html` in a browser — that is your visual target.
>
> Your territory is `app/(app)/**`, `components/**`, `app/globals.css`, `app/layout.tsx`, `public/manifest.json`, `public/icons/**`. You must not edit anything outside it — not `lib/contracts.ts`, not `lib/ai/**`, not `app/api/**`, not `lib/safety/**`, not `public/sw.js` (Lane D owns the service worker).
>
> You need no API key and no database. Everything renders from `fixtures/margaret.json`. That is deliberate: you cannot be blocked by another lane. If you find yourself waiting on Lane A, you have taken a wrong turn.
>
> Tailwind only. No component library — shadcn and every equivalent is explicitly rejected, because the design system is bespoke and a library's defaults are the templated look we are avoiding. Do not run `pnpm add`.
>
> Build in this order:
> 1. `<ProvenanceTag>` first. Its type must make a sourceless fact unrepresentable — either a `citation` prop or `userStated: true`, never both, never neither.
> 2. App shell and design tokens.
> 3. Timeline rendering from fixtures, every event carrying exactly one ProvenanceTag.
> 4. Upload UI, then the conflict card, then the gap panel.
> 5. Artefact views, review gate, print stylesheet.
>
> Every PR must include a screenshot of every changed screen and say which `docs/user-journey.md` steps it should make pass. The person reviewing you cannot read code — your preview URL and screenshots are the review.
>
> If you hit a genuine design or product decision, stop and write the question in your PR. Start with `<ProvenanceTag>` now.

---

## MACHINE 3 — Lane C (Safety & Detectors)

> You are Lane C on the Verity build. Read these four files in full before writing anything: `docs/lanes/lane-c-safety.md` (your brief), `prd.md` section 8, `research/01` section 6 (the 14 red-flag rules), `docs/stack-freeze.md`.
>
> Your territory is `lib/safety/**`, `lib/detectors/**`, `lib/copy/**`. Nothing else. Your code is pure functions with no I/O — other lanes import you. You need no API key and no database.
>
> You are the lane most likely to be asked to relax a rule for a demo beat. Never relax one. A blocked feature is a design problem for another lane to solve differently, and you should say so rather than bending.
>
> Build in this order, tests first in every case:
> 1. `red_flags.ts` — all 14 rules plus the negation and tense guard. Runs on concern text only, never on document text. Each rule needs a positive and a negative test.
> 2. The five deterministic gap detectors. Every statement is about the record, never advice.
> 3. `output_filter.ts` — runs on every generated string before persistence.
> 4. The well-managed-need detector. The model may only select a pre-written `CitationId`; it may never emit a paragraph number or citation text.
> 5. Consent helpers and the safety copy constants.
>
> The framework citations in your brief were verified against the primary sources this week — National Framework July 2022 revised July 2023, and the DST Guidance October 2022. Three domain level ceilings were wrong before that check. Do not paraphrase, re-word, or improve any citation string, and do not change the domain level data in `lib/contracts.ts`.
>
> Your PRs are mostly tests, and that is correct. State plainly in each description which safety property is now enforced and how it is proven. Start with `red_flags.ts` now.

---

## YOU — Lane D (Integrator), during merge windows

With three machines you run this yourself. Paste into a fourth Claude Code session on whichever machine is free:

> You are Lane D on the Verity build, the integrator. Read `docs/lanes/lane-d-integrator.md`, `docs/implementation-plan.md`, `docs/user-journey.md`, `docs/stack-freeze.md`.
>
> Your territory is `demo/**`, `scripts/**`, `.github/**`, `vercel.json`, `app/demo/**`, `public/sw.js`.
>
> Build CI first, before anything else: on every PR run `pnpm typecheck`, `pnpm test`, and a Vercel preview deploy. The keystone test in `lib/__tests__/contract.test.ts` runs on every PR — if it goes red, every lane is building against a lie, so stop everything and escalate.
>
> Then: the three modes (`live`, `fixtures`, `replay`) rendering through one identical code path, the fixtures recorder keyed by request hash, `/demo/reset`, and the service worker with network-first for HTML and API routes.
>
> If replay mode ever looks different from live, the fallback is a lie and a judge will spot it. That property matters more than anything else you build.

---

## MACHINE 4 or 5 — Lane E (Voice), only if Window 3 is green

> You are Lane E on the Verity build. Read `docs/lanes/lane-e-voice.md` and `docs/stack-freeze.md`.
>
> Your territory is `lib/voice/**` and `app/api/voice/**`. Nothing else.
>
> Build rung 1 completely before touching rung 2: browser `MediaRecorder` capture that uploads to Supabase Storage and creates a `Source` row with `kind: 'audio'`. Zero provisioning, works offline in replay mode.
>
> Only then rung 2: the Twilio webhook. A US number already exists — you are writing `/api/voice/inbound` and `/api/voice/recording`, not provisioning anything. Read the three gotchas in your brief first; each costs an hour if rediscovered.
>
> Do not build a conversational voice agent, outbound calling, or voice output. All three are explicitly out of scope for regulatory reasons stated in your brief — an agent that questions an elderly person about symptoms is interactive clinical information gathering, which is the line the whole product is designed to stay behind.

---

## When you send a lane back

Use this shape. Never describe code.

```
Journey 1, step 1.11 — FAIL
Expected: every timeline event has a citation chip or an orange badge
Saw: three events in June 2026 have neither
Preview: <paste URL>
```

If the same step fails in two consecutive review passes, send it to Lane D instead of the owning lane — two failures usually means a seam problem, not a feature problem.

---

## Night shift, paste to every lane before you sleep

> Night shift rules now apply. Do not merge to `main`. Do not edit `lib/contracts.ts` or `fixtures/**` for any reason. Work only inside your own territory, and only on the night-shift backlog in your brief — items that cannot block on another lane. If you hit a genuine decision, stop, write the question in your PR, and move to the next backlog item. Do not guess on a product decision while I am asleep.
