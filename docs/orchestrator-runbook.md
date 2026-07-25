# Orchestrator Runbook — your document

You are not writing code and not reading diffs. You are doing four things: **provisioning**, **launching**, **reviewing visually every 3–4 hours**, and **making the calls agents aren't allowed to make**.

Keep this open the whole time.

---

## Tonight (before kickoff)

All documents, decisions and accounts — safe under any pre-work rule. No code.

- [ ] Read `prd.md` end to end. It's 400 lines. If you disagree with anything, change it tonight, not tomorrow.
- [ ] Twilio: confirm you can reach the console and find your existing US number. Nothing to provision — wiring happens at hour 0 once a preview URL exists.
- [ ] Supabase project: **London / eu-west-2**, and **enable Anonymous Sign-Ins** (Auth → Providers). Miss this and Lane A stalls at hour 2.
- [ ] Anthropic **commercial** key (console.anthropic.com, not a claude.ai login).
- [ ] GitHub repo live at https://github.com/yogi100x/verity — public, `main` protected, scaffold committed, 20 tests green.
- [ ] Vercel project created, linked, Anthropic + Supabase env vars set.
- [ ] Read `demo/documents/README.md` and check Margaret's story hangs together.
- [ ] Open `demo/design-showcase.html` in a browser. That is the visual target — if you don't like it, say so tonight.
- [ ] Sleep. You will need it more than the extra three hours.

---

## Hour 0 — you alone, no agents (30 minutes)

The contract, migration, fixtures, templates, keystone tests **and the Next.js scaffold are all committed**, and `main` is public and protected. Hour 0 is verification and provisioning only.

```bash
git clone https://github.com/yogi100x/verity.git && cd verity
pnpm install && pnpm test     # 20 tests — must be green
```

Then, in order:

1. `cp .env.example .env.local` — Anthropic key now; Supabase keys when you have them
2. **`./scripts/db-push.sh`** — applies the schema and RLS. Needed by ~H4, not minute 0: Lane A's first task (the extraction spike) is deliberately no-DB.
3. **Enable Anonymous Sign-Ins** in the Supabase dashboard (Authentication → Sign In / Providers). Miss this and Lane A stalls around hour 2 with an error that looks like RLS and isn't.
4. After the first preview deploys: paste `https://<preview>.vercel.app/api/voice/inbound` into Twilio Console → Phone Numbers → your number → Voice Configuration → "A call comes in" (Webhook, HTTP POST). Two minutes, unblocks Lane E.

> **Gate: if `pnpm test` is red, do not launch lanes.** Every lane would build against a lie.

---

## Hour 0.5 — launch

On each machine:

```bash
git clone <repo> && cd <repo> && pnpm i
cp .env.example .env.local
git checkout -b lane/<x>
claude
```

Paste the whole lane brief as the first message:

| Machine | Paste |
|---|---|
| 1 | `docs/lanes/lane-a-pipeline.md` |
| 2 | `docs/lanes/lane-b-surface.md` |
| 3 | `docs/lanes/lane-c-safety.md` |
| 4 (if any) | `docs/lanes/lane-d-integrator.md` |
| 5 (if any) | `docs/lanes/lane-e-voice.md` |

With 3 machines you run Lane D yourself during merge windows.

---

## The review loop — every 3–4 hours, ~20 minutes

1. Lanes pause. Lane D merges and deploys **one** integrated preview.
2. Open it. Run **Journey 0** (60 seconds). If it fails, stop — everything else is noise.
3. Run the journeys listed for this window in `docs/implementation-plan.md` §5.
4. Per PR, ~90 seconds: green check? preview looks right? Merge or send back.
5. Report failures in the format at the bottom of `docs/user-journey.md`. Never describe code.
6. Lanes resume.

**A step failing twice in consecutive passes goes to Lane D, not the owning lane.** Two failures usually means a seam, not a feature.

---

## Decisions only you can make

Agents are told to stop and ask rather than guess. Expect these:

| Question | Your answer |
|---|---|
| "The contract seems wrong" | Usually no. If genuinely yes: edit `lib/contracts.ts` **and** `fixtures/margaret.json` in one commit, tell every lane to rebase. **Never during the night shift.** |
| "Can I relax a safety rule for the demo?" | **No.** Always no. Ask the lane to solve it differently. |
| "Should I add a severity/priority field?" | **No.** Not once, not anywhere, however useful it looks. |
| "Should I build X that isn't in the PRD?" | No, unless it protects the demo in `prd.md` §3. |
| "Extraction is poor on document Y" | Accept it, show the honest partial-read state. Don't chase it. |

---

## When a lane stalls

Symptoms: no PR in 3+ hours, a PR touching files outside its territory, or repeated red CI.

1. Ask for a one-paragraph status in plain English — no code.
2. Blocked on another lane? That's a plan bug — give it night-shift backlog work.
3. Stuck on something hard? Cut scope. Say explicitly what to drop.
4. Thrashing? Stop it, `git checkout lane/x`, re-paste the brief, name the one thing you want next.

**Never let an agent "just fix" something in another lane's territory.** That is how the 2am merge disaster starts.

---

## Decision points — take them on time

| When | Decide |
|---|---|
| **H12** | Conflict card working? If not, **cut the CHC pack** and ship discharge + GP brief. Taking this late is what kills demos. |
| **H16** | Blind gap test passed? If well-managed precision isn't 100%, switch it to a manual family-clicked toggle. Still demoable, zero fabrication risk. |
| **H20** | Demo path rehearsable end to end? If not, stop all feature work now, not at H24. |
| **H24** | **FREEZE.** Copy strings and fixture data only. It will feel wrong. Do it anyway. |

---

## Freeze checklist (H24)

- [ ] Journeys 1, 2, 5, 6 green
- [ ] Replay mode completes with wifi **physically off**
- [ ] Backup video recorded, under 90s, open in a second tab
- [ ] Language sweep clean (Journey 6)
- [ ] Demo account seeded, reset tested
- [ ] Tested at the actual projector resolution
- [ ] Three-minute script rehearsed aloud, timed, twice
- [ ] Prompt cache pre-warmed (re-warm every ~4 min while queuing)

---

## What loses demos, in order of likelihood

1. Venue wifi — mitigated by replay mode and the video. **Test both.**
2. Not rehearsing — teams with worse code and better storytelling consistently win.
3. Merging at hour 23 — mitigated by merge windows every 3–4 hours.
4. A stray urgency word in the UI — mitigated by Journey 6. Run it twice.
5. Saying "this is not a medical device" — **don't**. Use the `prd.md` §8 framing: we designed the model out of the seriousness judgement.

---

## Lines to have ready

**Why not ChatGPT?**
*"It answers what you ask, from what you give it. We tell you what's missing, and what disagrees. And every line we produce cites the page it came from."*

**Is this a medical device?**
*"Route and urgency judgements are where that line sits — NHS 111 online doesn't diagnose either and it's a registered device. So we didn't write a disclaimer, we designed the model out of that judgement. Red flags are deterministic and run before any model call. There is no severity field anywhere in our schema."*

**How do you know it isn't hallucinating?**
*"Every claim's quote must be a literal substring of its source or it's dropped before it's stored. That's a string operation, not a model behaviour. We show you the drop count."*

**How does this relate to Juno?**
*"Juno is the companion for living with the condition. We handle the events — discharge, assessments, funding — where paperwork decides the outcome and Juno never sees the paperwork. The interesting bit is when her account and the record disagree."*
