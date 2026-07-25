# User Journeys — runnable test script

**Purpose.** This is the document you walk through every 3–4 hours to check the build visually. You never read code. You click, you look, you tick.

**How to use it.** Each journey is a table. Do the **Action**, look for the **Expect**, tick **✓** or write what you saw instead. The **Lane** column tells you who to send it back to. A step you cannot perform yet because the feature isn't built is `— not yet`, which is fine and expected early.

**Where to run it.** Every PR gets a Vercel preview URL. Run the journey against that URL, not against localhost. Journey 1 is the demo path and must be green before anything else matters.

**Modes.** Append `?mode=live|fixtures|replay` to any URL.
- `live` — real Anthropic calls. Slow, costs money, proves it works.
- `fixtures` — recorded responses keyed by content hash. Fast, deterministic, default for testing.
- `replay` — fully seeded, zero network. The stage backup.

**Seeded account.** `/demo/reset` restores Margaret's case to its starting state. Run it before each pass so you're testing from the same place every time.

---

## Journey 0 — Smoke test (60 seconds)

Run this first every single time. If any step fails, stop and report; the rest of the journeys will be noise.

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 0.1 | Open the preview URL | Landing page renders. Warm paper background (not white). Serif headline. | B | |
| 0.2 | Look at the bottom of the page | Persistent safety banner: 999 / NHS 111 wording, always visible | C | |
| 0.3 | Click **Start** | Sarah's dashboard for Margaret Ellis. No login wall. | B | |
| 0.4 | Visit `/demo/reset` | Confirmation that the case reset. Return to dashboard shows zero sources. | D | |

---

## Journey 1 — The demo path (Sarah's first run)

**This is the one that matters.** It is the three minutes you will perform on stage. Every other journey is insurance.

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 1.1 | From a clean reset, drag `demo/documents/discharge-summary.pdf` onto the drop zone | Upload progress, then a processing state that names the file. No spinner-only state — it should say what it's doing. | B | |
| 1.2 | Wait for extraction | Source appears in the sidebar with a page count. Claim count displayed. | A | |
| 1.3 | Look for the drop count | A line reading like *"N claims extracted, M dropped for unverifiable quotes"*. M may be 0 — the line must still be present. | A | |
| 1.4 | Upload `repeat-prescription.jpg` (a photo, taken at an angle) | Extracts despite the angle. If it genuinely can't read part of it, an honest state saying which part — never a generic error icon. | A | |
| 1.5 | Upload `cardiology-letter-march.pdf` | Third source listed | A | |
| 1.6 | Open the seeded **Juno history** | Margaret's own entries appear as a source, attributed to her, timestamped. Entry of 3 July mentions the water tablet. | A | |
| 1.6b | Play the seeded voice note, or record one in-browser | Transcript appears, attributed, timestamped | A | |
| 1.7 | Open the **Timeline** | Events in date order. Approximate dates visibly marked as approximate (dotted underline + spelled out, e.g. "around March 2024"). | B | |
| 1.8 | Hover any timeline event | Popover with the **verbatim quote in monospace**, document name, and locator (e.g. `p.2 · line 14`) | B | |
| 1.9 | Click that citation chip | Source document opens at the correct page in a new tab | B | |
| 1.10 | Find an event with no document behind it | Orange badge reading *"You told us this — not from a document"* | B | |
| 1.11 | Scan the whole timeline | **Zero events with neither a citation chip nor an orange badge.** This is the core invariant — if you see a bare event, that's a hard fail. | B | |
| 1.12 | **Open the conflict card** | Amber card. Header in serif. Three chips side by side: discharge summary, prescription photo, **Margaret's Juno entry**. | B | |
| 1.13 | Click each of the three chips | Each opens its own source. The Juno chip shows her actual words, timestamped. Two chips are institutions; one is the patient. | B | |
| 1.14 | Read below the chips | A generated question, e.g. *"Three sources disagree about the water tablet (furosemide). Ask whether it should have been restarted."* | A | |
| 1.15 | Check the conflict card wording | States **what the documents say**. No "interact", no "too high", no severity, no urgency. | C | |
| 1.16 | Open the **Gaps** panel | At least 3 gaps. Each is a statement about the *record*, not advice. | A | |
| 1.17 | Find the deterministic ones | At least 2 gaps that are date arithmetic, e.g. *"discharge summary asks for renal review within 7 days; no result recorded after that date"* | C | |
| 1.18 | Check every gap against the documents | **Zero fabricated gaps.** A gap referring to something that doesn't exist is a hard fail — worse than a missing gap. | A | |
| 1.19 | Click **Generate CHC Evidence Pack** | Document renders, organised by the 12 named domains | A+B | |
| 1.20 | Find the *Drug therapies and medication* domain | The furosemide conflict appears here | A | |
| 1.21 | Find the well-managed-need flag | **PG 23.2 quoted verbatim** as the primary citation, para 162 as support — monospace, with references | C | |
| 1.22 | Check both references against the real documents | They match word for word. A wrong citation is the single most damaging possible failure. | C | |
| 1.23 | Click **Generate GP Appointment Brief** | A **visibly different** one-page artefact appears, from the same data, quickly | A+B | |
| 1.24 | Compare the two artefacts side by side | Same underlying facts, different structure, different audience. This is the "one engine, any gatekeeper" proof. | B | |
| 1.25 | Try to print before ticking the review box | Print button disabled, labelled *"Review to unlock printing"* | B | |
| 1.26 | Tick the review confirmation, then print | Print preview: A4, two columns, safety banner **hidden**, footer disclaimer present with your name and date | B | |

---

## Journey 2 — Emergency halt (the money moment for credibility)

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 2.1 | In the concern box, type *"chest pain going into my left arm and I'm sweating"* | Pipeline **halts**. Fixed 999 card. Under 3 seconds. | C | |
| 2.2 | Check the network tab | **No Anthropic request was made.** This is the whole point — detection is deterministic and runs first. | C | |
| 2.3 | Type *"no chest pain"* | Does **not** fire. Negation guard working. | C | |
| 2.4 | Type *"history of chest pain in 2019"* | Does **not** fire. Tense guard working. | C | |
| 2.5 | Type *"the discharge letter mentions chest pain"* into a **document** rather than the concern box | Does **not** fire. Red flags never scan document text. | C | |
| 2.6 | Look at the halt card | Quotes NHS guidance, links out, says plainly that we have **not** assessed anything | C | |

---

## Journey 3 — Degraded and hostile inputs

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 3.1 | Upload `bad-photo-handwritten.jpg` (deliberately poor) | Extracts what it can; explicitly names what it couldn't read; offers the original to view | A | |
| 3.2 | Upload a corrupt/zero-byte file | Clean error, case unaffected, no half-created source | A | |
| 3.3 | Upload `injection-test.pdf` (contains text instructing the model to ignore rules) | Instructions treated as **data**. No behaviour change. Output filter catches anything that leaks. | C | |
| 3.4 | Upload a document about a different person | No crash. Ideally surfaced as unmatched rather than silently merged. | A | |
| 3.5 | Upload nothing and try to generate an artefact | Empty state explaining what's needed — never a fabricated document | B | |

---

## Journey 4 — Consent and access

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 4.1 | Start a new person as a carer | Asked to declare a legal basis from exactly four options | C | |
| 4.2 | Try to continue without typing a name | Blocked. It's a typed full name, not a checkbox. | C | |
| 4.3 | Look at the dashboard header | Persistent badge naming the access basis and date | C | |
| 4.4 | Trigger revocation via `/demo/revoke` | Carer view empties immediately. Message says nothing was deleted. | C | |
| 4.5 | Look for any capacity assessment | There is none anywhere. We record an asserted basis; we never evaluate one. | C | |

---

## Journey 5 — Offline / stage-failure rehearsal

Run this at least twice before the demo, and once with the venue wifi actually off.

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 5.1 | Load `?mode=replay`, turn wifi **off** | Entire Journey 1 completes end to end | D | |
| 5.2 | Time it | Under 4 minutes, cold start to printed brief | D | |
| 5.3 | Compare replay against live visually | Identical rendering. If replay looks different, the fallback is a lie and will be spotted. | D | |
| 5.4 | Mid-run, kill the network during `live` mode | Degrades to fixtures without a visible error | D | |
| 5.5 | Play the backup video | Exists, current, under 90 seconds, loaded in a second browser tab | D | |
| 5.6 | On a phone, use **Add to Home Screen** | Installs with a proper icon and name | B | |
| 5.7 | Open from the home screen | Standalone — no browser chrome, no URL bar. Bottom navigation visible. | B | |
| 5.8 | Turn on airplane mode, reopen from the icon | App shell loads. Replay mode still completes Journey 1. | D | |
| 5.9 | Append `?nosw=1` | Service worker unregisters and the page hard-reloads — the kill switch works | D | |

---

## Journey 6 — Language and compliance sweep

Do this once at hour ~20 and again after freeze. It is the cheapest way to lose, and the cheapest to prevent.

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 6.1 | Search the running UI for `urgent`, `emergency`, `triage`, `severity`, `risk`, `priority` | Zero hits outside the 999 card and the fixed banner | C | |
| 6.2 | Search for `likely`, `suggests`, `consistent with`, `probably`, `indicates` | Zero hits | C | |
| 6.3 | Search for any condition name in generated prose | Present only where it appears verbatim in a cited source | C | |
| 6.4 | Check every artefact title | Never "clinical summary", "handover note", "referral", or "SBAR" | C | |
| 6.5 | Check the CHC pack | Never states or implies an eligibility outcome. Domain levels labelled *suggested*, never *determined*. | C | |
| 6.6 | Check emergency red `#B3261E` | Used **only** on the 999 card. Not on validation, not on errors. | B | |

---

## Journey 7 — Accessibility spot-check

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 7.1 | Zoom browser to 200% | No horizontal scroll, nothing clipped | B | |
| 7.2 | Navigate the whole of Journey 1 with keyboard only | Every control reachable, visible teal focus ring | B | |
| 7.3 | Open a citation popover with Enter, close with Escape | Works | B | |
| 7.4 | View on a phone-width viewport | Conflict chips stack, citation opens a bottom sheet | B | |
| 7.5 | Enable reduced-motion in OS settings | Animations become 100ms opacity only | B | |

---

## Journey 9 — Stretch goals (only test what has landed)

Each block maps to a stretch in `docs/implementation-plan.md` §7b. Test each one the moment it lands — a stretch that quietly breaks Journey 1 must be reverted, not debugged.

**After every stretch merge, re-run Journey 0 and Journey 1 steps 1.12–1.26 before ticking anything below.**

### S1 — Maya coda

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 9.1 | Switch to the Maya account | Same screens, first-person copy — "my discharge letter", not "Margaret's" | B | |
| 9.2 | Look for a consent step and access badge | Both absent — self is the degenerate carer case | B | |
| 9.3 | Switch back to Margaret | Consent step and badge both return; her data unchanged | D | |

### S2 — Compliance artefacts

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 9.4 | Open `docs/compliance/` | Three documents. Every hazard in the log names a control you can actually point at in the product. | C | |

### S3 — Request letters

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 9.5 | Click **Draft request letter** on the renal-review gap | A letter naming Margaret, the discharge date, and what was requested | C | |
| 9.6 | Read it as if you were the GP | States what the record shows and asks a question. No urgency, no advice, no "she needs". | C | |
| 9.7 | Try it on each gap type | Each routes to a sensible recipient — GP, district nurse, care home | C | |

### S4 — Attendance Allowance line

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 9.8 | Scroll to the end of the CHC pack | One line, "may be eligible", a rate, and a gov.uk link | C | |
| 9.9 | Check the rate against gov.uk **today** | Matches. A stale figure on stage is a caught error. | C | |

### S5 — Published eval numbers

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 9.10 | Open the README eval table | Shows documents tested, issues found, **invented = 0**, and names the one it missed | D | |

### S6 — Supersession

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 9.11 | Find the March "continue furosemide" instruction on the timeline | Struck through, dimmed, noted as replaced by the 25 June discharge | B | |
| 9.12 | Click its citation chip | Still opens the March letter — superseded evidence is still evidence | A | |

### S7 — Third template (discharge pack)

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 9.13 | Click **Generate discharge pack** | A third visibly distinct artefact from the identical Fact store | A | |
| 9.14 | Ask the agent what files it changed | Seed row plus a renderer. **If it changed extraction, grouping or verification, the abstraction failed — revert it.** | A | |

### S8 — Voice

| # | Action | Expect | Lane | ✓ |
|---|---|---|---|---|
| 9.15 | Ring the Twilio number from your own phone, speak, hang up | Prompt plays; ~30s later a new source appears in the app with your words | E | |

---

## Reporting a failure

When a step fails, you don't need to describe the code. Give the agent this and nothing more:

```
Journey 1, step 1.11 — FAIL
Expected: every timeline event has a citation chip or an orange badge
Saw: three events in June 2026 have neither
Preview URL: <paste>
```

The lane column tells you which agent to send it to. If a step fails in two consecutive review passes, escalate it to the integrator lane rather than the owning lane — it's probably a seam problem, not a feature problem.
