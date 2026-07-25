# Verity

**Powered by Juno.** Consumer Health Hackathon, 25–26 July 2026.

> You dump a family's medical paperwork in. A clean document for an official reader comes out. Every line in it traces back to the page it came from.

Not a summariser. The product is **provenance**: every assertion is either anchored to a verbatim quote at a known location in a source document, or explicitly badged as unverified. There is no third state, and it is enforced in code and in the database — not by a prompt.

---

## Start here

| If you are… | Read |
|---|---|
| **The orchestrator** | `docs/orchestrator-runbook.md` — tonight's checklist, hour 0, the review loop |
| **Launching agents** | `docs/launch-prompts.md` — copy-paste, one per machine |
| **An agent on a lane** | `docs/lanes/lane-<a–e>-*.md` — your brief. Read it in full first. |
| **Wondering what we're building** | `prd.md` — 400 lines, read §3 (the demo) first |
| **Writing any code** | `docs/contract-spec.md` + `docs/stack-freeze.md` |
| **Designing anything** | `docs/design.md`, and open `demo/design-showcase.html` |

---

## The rules that are not negotiable

1. **The contract is frozen.** `lib/contracts.ts` changes only with the orchestrator, never during a night shift.
2. **The stack is frozen.** No `pnpm add`. Rejected dependencies and the reasons are in `docs/stack-freeze.md`.
3. **Territory is exclusive.** Lanes own directories; two agents never edit the same file. Boundaries in `docs/implementation-plan.md` §2.
4. **No judgement fields, ever.** No `severity`, `urgency`, `priority`, `rank`, `risk` or `score` anywhere in any schema. The model cannot express a clinical judgement because there is nowhere to put one. This is the primary regulatory control.
5. **Tests are the code review.** The orchestrator reviews visually via preview URLs. A PR with a red check is not reviewed.
6. **H24 is a hard freeze.** Copy strings and fixture data only after that.

---

## Repo map

```
prd.md                    the product
prd-v1-archive.md         original CarePath PRD, superseded

docs/
  orchestrator-runbook.md your document
  launch-prompts.md       paste these into each machine
  implementation-plan.md  lanes, territories, hour-by-hour, stretches
  contract-spec.md        the contract, verbatim, + migration
  stack-freeze.md         frozen stack + rejected-and-why
  design.md               design system
  user-journey.md         9 runnable test journeys
  data-sources.md         real documents + verified facts
  lanes/                  one brief per agent

lib/contracts.ts          FROZEN. everything codes against this
lib/__tests__/            the keystone test
fixtures/margaret.json    a full CaseSnapshot. lanes B and C build on this alone
supabase/migrations/      0001_init.sql — schema + RLS

demo/
  design-showcase.html    open in a browser
  documents/              Margaret's synthetic dataset

scripts/
  bootstrap.sh            historical — exits early; scaffold is committed
  db-push.sh              apply schema + RLS
  verify.sh               pre-PR check (hooks run it automatically)

research/                 the four decision documents behind all of it
```

---

## Hour 0

```bash
pnpm install    # deps + husky hooks
pnpm test       # THE GATE — 20 tests, must be green
```

The Next.js scaffold is **already committed**. Do not run `scripts/bootstrap.sh` — it predates the scaffold and exits early by design.

**If tests are red, do not launch lanes.** Every lane would build against a lie.

Then:

```bash
./scripts/db-push.sh    # schema + RLS. Lanes A and D only.
```

…and enable **Anonymous Sign-Ins** in the Supabase dashboard. Easiest thing to
miss; Lane A stalls around hour 2 without it, with an error that looks like an
RLS problem and is not one.

## Before every PR

```bash
./scripts/verify.sh
```

Checks the contract is unmodified, no judgement fields exist, no urgency
language reached the UI, types and tests pass, and your changes stay inside one
lane's territory.

---

## Safety

Verity organises evidence people already hold. It does not assess symptoms, does not diagnose, and does not say how urgent anything is. Emergency detection is a deterministic rule list that runs **before** any model call and halts the pipeline. Route and urgency judgements are deliberately designed out of the model — see `prd.md` §8.

All demo data is synthetic. No real patient data at any point.
