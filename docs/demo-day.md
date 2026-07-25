# Demo Day — stage script, video, pitch

**Written 25 Jul 2026 evening, day 1.** Three separate artefacts, in the order you need them:
§1 the 3-minute live demo, §2 the recorded video, §3 the pitch narrative and Q&A defence.
§4 is the verified-claims sheet — every number below traces to a primary source checked 25 Jul.
§5 is the pre-demo checklist and the failure runbook.

Routes referenced are real: `/`, `/upload`, `/timeline`, `/conflicts`, `/gaps`, `/artefacts`,
`/artefacts/[key]`, `/demo/reset`, `/demo/seed`, `/demo/revoke`. Modes: `?mode=live|fixtures|replay`.

---

## 1. The live demo — 3 minutes

**Set up before you walk on.** Two browser windows. Window 1: the deployed URL at `?mode=live`,
freshly `/demo/reset`. Window 2 (hidden behind it): the same URL at `?mode=replay`, already warm,
plus a third tab holding the recorded video. You switch windows, you never debug on stage.

The three demo documents in a folder on the desktop, named so you can find them without looking:
`discharge-summary.pdf`, `repeat-prescription.jpg`, `cardiology-letter-march.pdf`.

### Beat 1 — the situation (0:00–0:20)

*Don't touch the laptop. Talk to the room.*

> "Margaret Ellis is 82. She was discharged from hospital last month — heart failure, kidney
> disease, diabetes. Her daughter Sarah lives 200 miles away and has a carrier bag of paperwork
> on the kitchen table. In six weeks Sarah has to sit in a funding assessment where that carrier
> bag decides whether the NHS pays for Margaret's care, or the family pays about sixty thousand
> pounds a year."

**Click:** on the last word, hit **Start** on the landing page. Dashboard, no login wall.

### Beat 2 — live upload (0:20–0:40)

*This is the only genuinely live model call. Everything after renders from content-hash fixtures
on the identical code path.*

**Click:** `/upload` — drag `discharge-summary.pdf` onto the drop zone. While it runs, keep talking.
Don't narrate the spinner.

> "She drops in the discharge summary. A phone photo of the repeat prescription — taken at an
> angle on a kitchen table, because that's what families actually have. And an older cardiology
> letter."

**Click:** drop the other two while speaking. Point at the drop count line — *"N claims extracted,
M dropped for unverifiable quotes"* — with one sentence:

> "That second number is the product. Anything we couldn't anchor to a verbatim quote at a known
> location, we threw away rather than showed you."

### Beat 3 — THE MONEY MOMENT, conflict card (0:40–1:20)

*Forty seconds. The whole pitch is this card. Slow down here — this is where people decide.*

**Click:** `/conflicts`. Amber card, three chips.

> "Three sources disagree about one medicine — furosemide, the water tablet.
> The discharge summary, page 2, line 14: **stopped.**
> The repeat prescription, printed eight days later: **still listed.**
> And Margaret's own Juno entry, 3rd of July: *'still taking my water tablet at bedtime like
> always.'*"

**Click:** each of the three chips in turn. Each opens its source. Let the Juno one linger —
her actual words, timestamped.

> **"Two of those are institutions. One of them is Margaret. Nobody had ever put them in the
> same room."**

*Beat. Let it land. Then point below the chips.*

> "And underneath, a question nobody typed: *'Three sources disagree about the water tablet.
> Ask whether it should have been restarted.'* Notice what it doesn't say. It doesn't say the
> dose is wrong. It doesn't say this is urgent. It states what the documents say and it asks a
> question — because we are not allowed to make a clinical judgement, and I'll show you why in
> a moment."

### Beat 4 — timeline and gaps (1:20–2:00)

**Click:** `/timeline`. Hover one event — popover with monospace quote, document name, `p.2 · line 14`.

> "Every event on this timeline carries either a citation chip or an orange badge saying 'you
> told us this — not from a document'. There is no third state. Scroll it as long as you like:
> you will not find a bare assertion, because a claim whose quote doesn't survive a substring
> check against the source never reaches the database."

**Click:** `/gaps`.

> "And this panel reasons about **absence**. 'The discharge summary asks for a renal function
> review within seven days. There is no result recorded after that date.' When you ask me how I
> know the model isn't making that one up — it isn't a model. That's date arithmetic in
> TypeScript. Five detectors, all deterministic."

### Beat 5 — CHC evidence pack (2:00–2:35)

**Click:** `/artefacts` → **Generate CHC Evidence Pack**. Scroll to *Drug therapies and medication*.

> "Twelve named domains, the ones the assessor actually works through. The furosemide
> disagreement lands here, in Drug Therapies and Medication — one of the domains that can reach
> the Priority level."

**Click:** the well-managed-need flag. Practice Guidance 23.2, quoted verbatim in monospace.

> "*'Where needs are being managed via medication, it may be more appropriate to reflect this in
> the Drug Therapies and Medication domain.'* And paragraph 162: *'well-managed needs are still
> needs.'*
> **That isn't our interpretation. That's the Framework telling assessors to do exactly this.
> Check it against the government PDF right now — I'll wait.**"

*Then the stake, flat, no drama:*

> "If this pack works, the NHS pays 100% of Margaret's care. If it doesn't, this family pays
> around sixty thousand a year. Nationally the proportion of people found eligible has fallen
> from 31% to under 17% since 2017, with no change in the criteria. The evidence didn't get
> worse. The paperwork got harder."

### Beat 6 — the same engine, different gatekeeper (2:35–2:50)

**Click:** back to `/artefacts` → **Generate GP Appointment Brief**. It renders fast and looks
visibly different.

> "Same record. Same engine. Nothing re-read, nothing re-extracted. Different gatekeeper.
> A template here is a **row in a table** — sections, slots, which keys fill them, whether a
> citation is mandatory. Adding a fifth gatekeeper is seed data, not a new code path."

### Beat 7 — close (2:50–3:00)

> "Discharge packs. Benefits claims. Patients self-serving instead of a carer doing it for them.
> All of it is template rows over the same claim table.
> We don't summarise a family's paperwork. We make it **citable**."

### If you get 30 extra seconds

Run the emergency halt. It buys more credibility than any feature:

**Type** into the concern box: *"chest pain going into my left arm and I'm sweating"* → fixed 999
card, under 3 seconds. **Open the network tab.**

> "No request was made to Anthropic. The red-flag scan is a deterministic rule list that runs
> *before* any model call and halts the pipeline. The model never gets the chance to be
> reassuring about chest pain."

Then type *"no chest pain"* and *"history of chest pain in 2019"* — neither fires. Negation and
tense guards.

---

## 2. The video — 90 seconds

Two different videos, don't confuse them:

- **2a. The submission video** — 90s, voiced, the thing judges watch without you.
- **2b. The stage backup** — the *same* 90s file, in a second browser tab, muted-ready, played only
  if the laptop dies mid-demo. Journey 5.5 requires it to exist and be current.

### 2a. Shot list — record this in `?mode=replay`, wifi off

Replay, not live. A recorded video must never gamble on a network call, and Journey 5.3 already
requires replay to render identically to live.

| # | Duration | Shot | Voiceover |
|---|---|---|---|
| 1 | 0:00–0:08 | Static: the carrier bag / paperwork pile, or landing page held still | "An 82-year-old leaves hospital. Her family gets a carrier bag of paper — and six weeks to prove her care should be NHS-funded." |
| 2 | 0:08–0:20 | Screen capture: three files dragged onto `/upload`, extraction running | "Verity takes the paperwork. A discharge summary. A phone photo of a prescription. An old clinic letter." |
| 3 | 0:20–0:25 | Zoom on the drop-count line | "Anything it can't anchor to a verbatim quote, it throws away — and tells you how many." |
| 4 | 0:25–0:45 | **Hold on the conflict card.** Slow cursor over each of the three chips, one click each | "Three sources disagree about one medicine. The hospital says stopped. The pharmacy says still listed. And Margaret says she's still taking it. Two of those are institutions. One is the patient. Nobody had ever put them in the same room." |
| 5 | 0:45–0:55 | Timeline hover → monospace quote popover → click through to the source page | "Every line traces to the page it came from. Hover it. Click it. Read the original." |
| 6 | 0:55–1:05 | `/gaps`, cursor resting on the renal-review gap | "It also reasons about what's missing. 'A renal review was asked for within seven days. No result was recorded.' That one isn't a model — it's date arithmetic." |
| 7 | 1:05–1:20 | CHC pack generating → scroll to PG 23.2 quote → cut to GP brief rendering | "One click builds the funding evidence pack, quoting the national Framework verbatim. Another builds a GP brief from the identical record. Same engine. Different gatekeeper." |
| 8 | 1:20–1:30 | Print preview, then hold on the printed page | "It ends as a piece of paper someone official will actually read. Verity. We don't summarise your paperwork — we make it citable." |

### Recording notes

- **Record at 1440×900 or 1280×800**, not full-screen 4K — text stays legible when a judge watches
  it in a small embed.
- **Cursor movement is the edit.** No zoom-punch transitions, no music stings. Move the cursor
  deliberately and pause 1s before each click; that reads as confidence.
- **Do the conflict-card shot in one unbroken take.** A cut there looks like you hid a reload.
- Reduced motion is fine to leave off, but if animations stutter under screen capture, enable OS
  reduced-motion — the app degrades to 100ms opacity fades and records cleaner.
- **Voice over afterwards**, don't talk while clicking. Record the screen silent, then one clean
  audio pass. Your timing will be tighter and you can re-do a line without re-doing a click.
- Export **under 100MB, H.264 MP4**. Put it in the repo? No — it will bloat the clone. Host it and
  put the link in the README.

---

## 3. The pitch

### 3a. The 60-second version (if that's all you get)

> "When someone leaves hospital, their family ends up holding the only complete copy of their
> medical story — in a carrier bag. And within weeks, someone official asks them to prove
> something from it: a funding assessment, a benefits claim, a GP appointment where they get
> seven minutes.
>
> Verity takes that pile and produces the document the official reader wants — where every single
> line traces back to the page it came from. Not a summary. A citable record.
>
> The reason that matters: we hold two halves that never meet. The institution's version — the
> discharge letter, the prescription — and the patient's own version, which Juno has been
> collecting all along. When those two disagree about a medicine, that disagreement is a
> first-class object in our database, with the patient's own words as a citation of equal
> standing.
>
> And we're deliberately not a chatbot. There is no severity field, no urgency field, no risk
> score anywhere in our schema — the model *cannot* express a clinical judgement, because there
> is nowhere to put one. That's not a prompt instruction. It's the shape of the database."

### 3b. The structure, if you get 3–5 minutes

**1. The problem is not information. It's proof.**
Families don't need their paperwork explained to them. They need it *accepted* by someone with a
form. The gatekeeper doesn't want a summary — they want to know where it says that.

**2. Why a general assistant doesn't do this.** Three things:
- It smooths over disagreement. We treat disagreement as an object.
- It can't reason about absence. "Nothing was recorded after that date" is arithmetic, not a guess.
- It produces prose. We produce an artefact for a *named* gatekeeper, and the same evidence
  produces a different artefact for a different gatekeeper without re-reading anything.

**3. Why now.** ChatGPT Health launched January 2026 and relaunched to all US users on 23 July —
two days ago — and is still not available in the UK, the EEA or Switzerland. The first independent
safety evaluation, in Nature Medicine in February, found it under-triaged 52% of gold-standard
emergencies. The UK gap isn't a market oversight; it's a regulatory position. **We're built for
the side of that line the UK is actually on** — which is why we designed judgement out of the
schema rather than prompting against it.

**4. The Juno half.** Juno is the companion for *living with* a condition — symptoms, patterns,
day to day. Verity is for the **events**: a discharge, an assessment, a claim, where a pile of
paperwork suddenly determines an outcome and Juno never sees the paperwork. Two halves, one
reconciliation. Say this plainly — do not pitch our GP brief as a better version of Juno's doctor
report. It isn't, and the sponsor will notice.

**5. Demo.** §1.

**6. Why it scales.** A gatekeeper is a template row. Five detectors are pure functions. The
contract is frozen and the tests are the review — 1,400+ of them.

**7. The ask / roadmap.** Discharge pack, benefits, patient self-serve, all template rows over the
same claim table.

### 3c. Q&A — the questions you will actually get

**"How do you know it isn't hallucinating?"**
> "Two different answers, because there are two different mechanisms. Every extracted claim carries
> a verbatim quote and a locator. Before it's written, we substring-check the quote against the
> source text. Fails the check, it's dropped, and the drop count is on screen. Separately, the
> gaps aren't generated at all — they're five deterministic detectors, pure TypeScript over the
> fact set. Date arithmetic can't hallucinate."

**"Isn't this giving medical advice? / Is it a medical device?"**
> "We state facts about documents. We never compute a clinical judgement. The control is
> structural, not a prompt: there is no severity, urgency, priority, risk or score field anywhere
> in the schema, at any level. Our CI fails the build if one appears. The model has nowhere to put
> a judgement. And emergency detection is a regex list that runs before any model call — I can
> show you the network tab."

**"What if the model gets a citation wrong?"**
> "A wrong citation is the single worst failure we could have, so we don't trust the model with it.
> The quote must appear verbatim in the source or the claim doesn't exist. The locator is
> clickable and opens the document at the page. You can check any line on this screen against the
> original in two clicks — please do."

**"Why not just use ChatGPT?"**
> "Three reasons. It isn't available for health in the UK. It smooths over exactly the
> disagreements that matter here. And it can't hand you a document with a locator on every line
> that an assessor will accept."

**"Are you predicting CHC eligibility?"**
> "No, and deliberately. We never state or imply an outcome. Domain levels are labelled
> *suggested*, never *determined*. We assemble the evidence the assessor asks for; the decision
> stays with the assessor. A positive Checklist is a door, not a verdict — the Framework says so
> itself, para 3: the threshold is intentionally set low."

**"How is this different from Juno?"** — see §3b point 4. Boundary is the *situation*, not the patient.

**"What about consent — she's 82, is she competent?"**
> "We never evaluate capacity. That's not our judgement to make. The carer declares a legal basis
> from four options and types their full name, and that basis is displayed on the dashboard
> permanently. Revocation empties the carer's view immediately and deletes nothing."

**"What's the business model / who pays?"**
> "The event is the moment of willingness to pay. Families currently pay specialist CHC advocates
> per case. That's the comparison we'd be priced against." *(Don't quote a Beacon figure — it's
> unverified, see §4.)*

**"Did you build this in 24 hours?"**
> "Five parallel agent lanes with exclusive file territories against a frozen contract. 1,400+
> tests, all green, every merge gated on them. Happy to walk the repo."

### 3d. Things not to say

- Never "triage", "urgent", "severity", "risk", "priority" — outside the 999 card.
- Never "likely", "suggests", "consistent with", "indicates".
- Never call an artefact a "clinical summary", "handover note", "referral" or "SBAR".
- Never "better than Juno's doctor report".
- Never a benefit rate or a stat that isn't in §4.

---

## 4. Verified claims sheet — checked 25 Jul 2026

All three previously-unverified pitch claims now check out. Two are stronger than we thought.

**ChatGPT Health UK exclusion — VERIFIED, and now sharper.**
Launched 7 Jan 2026, explicitly excluding the EEA, Switzerland and the UK. **Relaunched to all US
users 23 July 2026 — two days before this hackathon** — and the UK/EEA/Switzerland exclusion
persisted; no timeline committed for Europe. Safe stage wording: *"launched in the US in January,
relaunched two days ago, still not available in the UK."*
⚠️ Do **not** conflate with the OpenAI *API*, which does serve the UK and EEA.
Sources: [OpenAI](https://openai.com/index/introducing-chatgpt-health/) ·
[Euronews](https://www.euronews.com/next/2026/01/08/open-ai-launches-dedicated-chatgpt-health-feature-with-medical-record-integrations) ·
[MLQ, July relaunch](https://mlq.ai/news/openai-relaunches-chatgpt-health-for-all-us-users-with-medical-record-and-apple-health-integration/)

**Nature Medicine 52% under-triage — VERIFIED.**
Ramaswamy et al., *Nature Medicine* 32, 1671–1675 (2026), published 23 Feb 2026,
DOI 10.1038/s41591-026-04297-7. Mount Sinai. 60 clinician-authored vignettes, 21 domains, 16
factorial conditions, 960 responses. Under-triaged **52%** of gold-standard emergencies (paper
reports 51.6%) — DKA and impending respiratory failure routed to 24–48h review rather than ED.
Also: anchoring bias when family minimised symptoms (OR 11.7).
⚠️ **There is a rebuttal.** A March 2026 Macquarie preprint argues the exam-style protocol —
forced A/B/C/D, suppressed clarifying questions — drives the failure, not model capability. If a
judge raises it, concede it immediately and pivot: *"Fair, and that's the point — the failure mode
is format-dependent and hard to predict, which is exactly why we removed judgement from the schema
instead of trying to prompt it safe."*
Sources: [Nature Medicine](https://www.nature.com/articles/s41591-026-04297-7) ·
[Mount Sinai](https://www.mountsinai.org/about/newsroom/2026/research-identifies-blind-spots-in-ai-medical-triage) ·
[rebuttal preprint](https://arxiv.org/pdf/2603.11413)

**CHC 31% → 17% — VERIFIED (King's Fund, 2026).**
Standard CHC assessment conversion rate **31.25%** in Apr–Jun 2017 vs **16.65%** in Jan–Mar 2026.
Regional spread: 35.37% (Cambridge & Peterborough) down to 2.26% (Gloucestershire) — the *variation*
is a better line than the average if you want one number. Corroborated: Nuffield Trust 24%→17%
(2021→2025); Parliament, Mar 2026 debate, ~31%→18.6%; NHS England official Q3 2025-26 conversion
rate 19%. Fast Track recipients found no longer eligible on reassessment **+28.21%** since 2017/18,
with no criteria change.
Safe stage wording: *"from 31% to under 17% since 2017, with no change in the criteria."*
Sources: [King's Fund](https://www.kingsfund.org.uk/insight-and-analysis/press-releases/near-30-rise-rejections-nhs-sc-kf) ·
[Nuffield Trust](https://www.nuffieldtrust.org.uk/news-item/analysis-reveals-unfair-luck-of-the-draw-in-access-to-nhs-funded-care-packages) ·
[NHS England statistics](https://www.england.nhs.uk/statistics/statistical-work-areas/nhs-chc-fnc/)

**Attendance Allowance — re-verified 25 Jul 2026.** Lower **£76.70**/wk, higher **£114.60**/wk.
Unchanged. [gov.uk](https://www.gov.uk/attendance-allowance/what-youll-get)

**Still unverified — do not say these out loud.**
- Beacon £1,400–£4,000 per case (site blocks automated access)
- 30-day readmission rates, delayed-discharge bed days
- The ~£60k/year care-cost figure is a widely-used round number; say *"around sixty thousand a
  year"* as an illustration, never as a cited statistic.

---

## 5. Pre-demo checklist and failure runbook

### The morning of (in this order — earlier items unblock later ones)

1. `pnpm test` green, `./scripts/verify.sh` clean.
2. Production deploy current with `main`. Open the URL on **your phone** as well as the laptop.
3. `/demo/seed` then `/demo/reset` on production. Confirm the source counts match the fixture
   (6 sources / 18 / 11 / 4 / 2).
4. **Walk Journey 1 end to end on the production URL.** Not localhost. Every step 1.1–1.26.
5. Walk Journey 2 (emergency halt) — including the network tab check you'll do on stage.
6. **Journey 5 with the venue wifi actually off**, `?mode=replay`, timed. Must complete under 4 min.
7. Re-check the AA rate against gov.uk (§4). Takes 20 seconds; a stale rate on stage is a caught error.
8. Video recorded, exported, **open in a second browser tab** before you walk on.
9. Charge the laptop. Disable notifications, Slack, calendar popups. Close every other app.
10. Screenshots into PRs #8/#10/#15/#17 if you still want them — lowest priority, do last.

### On stage, if it breaks

| Symptom | Do this | Say this |
|---|---|---|
| Upload hangs > 8s | Keep talking through beat 2. It falls back to fixtures silently by design | nothing — don't draw attention |
| Extraction errors | Switch to window 2 (`?mode=replay`), continue from `/conflicts` | "I'll run this from the rehearsed dataset so we don't spend your time on my wifi." |
| Whole app down | Third tab: play the video | "Let me show you the recording — and the URL's on the slide, open it on your phone while I talk." |
| Laptop dies | Your phone. It's a PWA, installed to the home screen, works offline in replay | "It's a web app — here it is on my phone." |
| A citation opens the wrong page | Own it instantly, move on | "That's a bug and it's the worst kind we can have. The invariant is enforced at write time; the viewer clearly isn't. Noted." |

**Never** debug on stage, never open devtools except for the deliberate network-tab moment, never
apologise twice.

### Known debts — if a judge finds one, don't bluff

- **IDOR on the voice and persist routes** (caller-supplied `person_id`, no ownership check).
  Say: *"Known, flagged in the PR, blocks any real user. Not fixed in 24 hours."*
- **Dangling `facts.conflict_id`** — conflicts detect live but `claim_conflicts` rows aren't
  persisted in every path.
- Parked: concurrency cap, `generation_logs`.

Honesty about these reads as engineering maturity. Bluffing about them reads as everything else
being a bluff too.
