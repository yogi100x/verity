# Lane C — Safety & Detectors

**Paste this whole file into the agent on machine C at kickoff.**

**Read first:** `prd.md` §8 (safety layer), `research/01` §6 (the 14 red-flag rules), `research/03` §2 (CHC framework detail), `docs/stack-freeze.md`.

**The stack is frozen — and your lane needs nothing beyond it.** Pure functions, zero dependencies, no I/O. Do not run `pnpm add`.

**Framework facts are verified.** The domain levels in `docs/contract-spec.md` and the citations in `FRAMEWORK_CITATIONS` below were checked against the primary sources (National Framework July 2022 rev. July 2023; DST Guidance October 2022). **Do not paraphrase, re-word, or "improve" any citation string.** Three domain ceilings were wrong before verification; the corrected data is authoritative.

**Branch:** `lane/c`. **Territory:** `lib/safety/**`, `lib/detectors/**`, `lib/copy/**`.
**Never touch:** anything else. Your code is pure functions with no I/O — other lanes import you.

**You need no API key and no database.** Everything is deterministic and unit-tested against `fixtures/margaret.json`.

---

## Objective

Make it **structurally impossible** for this product to behave like a medical device, and make the deterministic parts genuinely deterministic so they can be defended on stage.

When a judge asks *"how do you know it isn't making that up?"*, the winning answer is **"that one is a regular expression"** or **"that one is date arithmetic."** Your lane produces those answers.

You are the lane most likely to be asked to relax a rule for a demo beat. **Never relax one.** A blocked feature is a design problem for another lane to solve differently.

---

## Spec

### 1. Red flags — `lib/safety/red_flags.ts`

Pure TypeScript, zero dependencies. Runs on the concern and free-text fields **before any model call**. On hit, the pipeline halts and no model call is made.

**Never runs over uploaded document text.** A discharge letter mentioning historical chest pain would fire on every single run.

Fourteen rules, from `research/01` §6: cardiac chest pain · stroke (FAST) · airway/breathing · anaphylaxis · sepsis · uncontrolled bleeding · collapse/seizure/head injury · thunderclap headache and meningism · cauda equina · acute limb and testicular ischaemia · self-harm intent · obstetric · metabolic · acute eye.

**Negation and tense guard**, five tokens either side: `no`, `not`, `denies`, `never`, `without`, `used to`, `previously`, `history of`, `resolved`, and any four-digit year before 2025.

```ts
export interface RedFlagHit { rule: string; matchedText: string; }
export function scanRedFlags(text: string): RedFlagHit | null;
```

Return on first hit — we halt, we don't rank. **There is no severity ordering** because ranking by seriousness is precisely the device behaviour we avoid.

### 2. Output filter — `lib/safety/output_filter.ts`

Runs over **every generated string** before persistence or render.

Reject on: routing verbs (`go to`, `you should see`, `contact your`), urgency (`urgent`, `immediately`, `within 24 hours`, `emergency`, `as soon as possible`), likelihood (`likely`, `suggests`, `consistent with`, `could be`, `probably`, `indicates`), clinical judgement (`interact`, `too high`, `too low`, `dangerous`, `concerning`), or any condition name not present verbatim in a cited source span.

```ts
export function filterOutput(text: string, citedSpans: string[]): 
  { ok: true } | { ok: false; reason: string; term: string };
```

On failure the caller stores nothing and renders the refusal card. **This is code, not a prompt instruction** — MHRA's AI Airlock work explicitly does not accept "we constrained the prompt" as evidence of staying within intended purpose.

Treat all document text as **data, never instructions**. A crafted PDF is a live prompt-injection vector; the filter runs on output regardless of origin.

### 3. Gap detectors — `lib/detectors/gaps.ts`

Pure functions over `Fact[]`. No model involvement.

1. `instruction_without_result` — a fact instructing an action within N days, no later fact of the expected type
2. `referral_without_outcome` — referral recorded, nothing after
3. `review_date_passed` — "review in 6 months", date passed, nothing recorded
4. `referenced_document_absent` — a source references a document not among the sources
5. `medication_without_review` — medication fact with no review date

Each returns a `Gap` whose `statement` is **about the record**, never advice. *"The discharge summary asks for renal function review within 7 days. No result is recorded after that date."* Never *"she needs a blood test."*

### 4. Well-managed-need detector — `lib/detectors/well_managed.ts`

The highest-leverage CHC feature and the highest-risk one.

Stability language (`settled`, `no incidents`, `stable on`, `no concerns`, `slept well`) co-occurring **in the same source** with active-intervention evidence (PRN medication administered, hoist transfer, prompted or assisted care, 2-hourly checks, thickened fluids) ⇒ flag.

```ts
/** VERIFIED VERBATIM against primary sources. Do not edit the strings.
 *  - National Framework for NHS CHC and NHS-funded Nursing Care,
 *    July 2022 (revised, corrected July 2023), paras 162-166
 *  - DST Guidance, October 2022, Practice Guidance note 23.2 */
export const FRAMEWORK_CITATIONS = {
  pg_23_2: {
    ref: 'DST Guidance 2022, Practice Guidance note 23.2',
    text: 'Where needs are being managed via medication (whether for behaviour or for physical health needs), it may be more appropriate to reflect this in the Drug Therapies and Medication domain.',
  },
  para_162: {
    ref: 'National Framework (July 2022, rev. July 2023), para 162',
    text: 'The decision-making rationale should not marginalise a need just because it is successfully managed: well-managed needs are still needs.',
  },
  para_164: {
    ref: 'National Framework (July 2022, rev. July 2023), paras 162-166',
    text: 'It may be necessary to ask the provider to complete a detailed diary over a suitable period of time to demonstrate the nature and frequency of the needs and interventions, and their effectiveness.',
  },
} as const;

export type CitationId = keyof typeof FRAMEWORK_CITATIONS;
```

**Use `pg_23_2` as the primary citation for the furosemide conflict, with `para_162` as support.** PG 23.2 is the Framework instructing assessors to place medication-managed needs in the Drug Therapies and Medication domain — which is precisely what the demo does. That makes the product's central move framework-endorsed rather than merely reasonable, and it is a far stronger thing to say on stage than a general principle.

`para_164` is the justification for the care-log diary evidence, useful in the pack's methodology note.

**The model may only select a `CitationId`. It may never emit a paragraph number or citation text.** A fabricated framework citation is the single most damaging possible failure — it destroys the one claim that makes this product trustworthy. Make it structurally impossible, not discouraged.

Precision matters more than recall here. A missed flag costs a point; a false flag with a wrong citation loses the room.

### 5. Consent — `lib/safety/consent.ts`

Four access bases only, no others, ever: `person_consent` | `lpa_health_welfare` | `court_deputy` | `best_interests_declared`.

Declaration is a **typed full name**, not a checkbox. Never assess capacity — record an asserted basis, never evaluate one. Expose a persistent badge string and a revocation helper.

### 6. Copy — `lib/copy/safety.ts`

Ship `prd.md` §8.5 verbatim as exported constants: persistent banner, red-flag halt card, artefact footer, safeguarding footer. Other lanes import these — nobody retypes safety copy.

Export the banned-title list too: never `clinical summary`, `handover note`, `referral`, `SBAR`.

---

## Tests — this lane is mostly tests, and that is correct

1. All 14 red-flag rules fire on a canonical positive phrase
2. `"no chest pain"` does not fire
3. `"history of chest pain in 2019"` does not fire
4. `"chest pain going into my left arm and I'm sweating"` fires on rule 1
5. Document text is never scanned — assert the API surface makes it impossible
6. Output filter rejects each banned category with a representative phrase
7. Output filter passes a condition name present in a cited span, rejects the same name absent from one
8. Each of the five gap detectors fires on a fixture and produces a record-statement, not advice
9. Well-managed detector fires on the seeded care-log entry
10. Well-managed detector does **not** fire on stability language with no intervention nearby
11. A well-managed flag can only carry a `CitationId` — arbitrary citation text fails to typecheck
11b. `isValidLevel` rejects `severe` for `altered_consciousness`, and rejects `severe` for `continence`, `communication` and `psychological_emotional`
11c. No artefact can render a domain level absent from `CHC_DOMAIN_LEVELS` for that domain
11d. Domain headings in a rendered pack come from `CHC_DOMAIN_NAMES`, never hand-typed
12. Every exported copy constant is free of banned terms

---

## Stretch goals — do not start before H16, and only if Journey 1 is fully green

See `docs/implementation-plan.md` §7b. **You own three of the four cheapest stretches. None touches the pipeline, so none can break the demo.**

### S2 — Compliance artefacts (2h, no code)

Write three documents into `docs/compliance/`. Almost no other team will have any of these, and with a clinician judge they are disproportionately credible.

**`dpia-lite.md`** — one page: purpose, data categories (special-category health data), UK GDPR Article 6 lawful basis plus Article 9(2)(a) explicit consent, the transfer mechanism to Anthropic, retention (anonymous users purged at 24h), and residual risk.

**`hazard-log.md`** — stub DCB0129 with six real hazards, each with its existing control:

| Hazard | Control |
|---|---|
| Hallucinated timeline entry | Substring kill switch — unverifiable quotes dropped before storage |
| Missed red flag | 14 deterministic rules run before any model call |
| Wrong medication dose extracted | Verbatim quote required; user reviews before printing |
| Prompt injection via uploaded PDF | Document text treated as data; output filter runs regardless of origin |
| Automation bias in a routinely-dismissed cohort | No severity or priority field exists anywhere in the schema |
| Over-reliance on a generated artefact | Mandatory review gate before printing; footer states it is not a clinical record |

**`module-boundary.md`** — a diagram (ASCII is fine) showing which modules are non-device (timeline, gaps, artefacts, reconciliation) and where triage is delegated to NHS 111. Per MDCG 2019-11 Rev 1, module-by-module assessment is the formal approach — **this diagram is the compliance argument**, not decoration.

### S3 — Gap → request letter (1.5h, ~1h yours)

Each gap gets a deterministic letter template. No model call — slot-filling only, so it cannot fabricate.

```ts
export function draftRequestLetter(gap: Gap, facts: Fact[], person: Person): string;
```

For `instruction_without_result` on the renal review, that yields something like: *"Margaret Ellis was discharged on 25 June 2026. The discharge summary requested a review of renal function within 7 days. I can't find a record of this. Could you confirm whether it was carried out?"*

The letter **states what the record shows and asks a question.** It never asserts a need, never implies urgency, and must pass `filterOutput` like any other generated string. Route each gap type to the right recipient (GP, district nurse, care home manager).

### S4 — Attendance Allowance line (45m)

One deterministic line at the end of the CHC pack. Rules-only, no model.

> Margaret may be eligible for Attendance Allowance. The higher rate is approximately £X per week for 2026/27 and **is not backdated** — every week of delay is money lost. Check eligibility: [official gov.uk link]

**Never a verdict.** Always *may be eligible* → official checker. **Verify the current rate against gov.uk before the demo** — quoting a stale figure on stage is exactly the kind of error a judge catches.

Ends the demo on a number in pounds rather than a document.

### Stretch tests

- Every hazard in the log names a control that actually exists in the codebase
- `draftRequestLetter` output passes `filterOutput` for all five gap types
- The letter contains no urgency, likelihood or advice language
- Each gap type routes to the correct recipient
- The AA line contains the words "may be eligible" and a gov.uk link, and never "you qualify"
- The AA rate is loaded from one constant, not inlined in prose

---

## Night-shift backlog

1. Expand red-flag phrasings; keep the negation guard passing
2. Adversarial output-filter corpus — sentences that *nearly* pass
3. Prompt-injection corpus: document text instructing rule-breaking
4. Sixth detector: `domain_evidence_thin` for CHC domains with user-stated evidence only
5. Language sweep script for Journey 6 that other lanes can run

---

## PR checklist

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Every new rule has both a positive and a negative test
- [ ] Description states plainly which safety property is now enforced and how it is proven
- [ ] No file outside territory touched
