# Elder Care vs Chronic Illness: The Wedge Decision

## 1. Verdict

**Extend, don't pivot.** Elder care is not a better wedge than chronic illness — it is the *same engine pointed at the person who actually pays*, and the entire delta is a consent layer plus one extra output, not a second product. Build **Handover (discharge cut)**: the identical CarePath pipeline, operated by an adult child, seeded with a hospital discharge, where the hero moment is three sources disagreeing about one medicine and that disagreement becoming a question on the appointment brief.

---

## 2. Elder care vs chronic illness, side by side

| | Chronic illness (current PRD) | Elder care (carer mode) |
|---|---|---|
| **Cohort size (UK)** | Multimorbidity in adults 30+: 53.8% (2019) → 71.9% (2049); 19.2m → 35.3m people | 5.8m unpaid carers (Census 2021/22); ~8.9m self-reported (Understanding Society 2023–25); 1.4m sandwich carers (ONS) |
| **Document density per case** | Moderate — patient holds their own letters | Extreme — 67% of over-74s have 2+ LTCs; 402,462 over-75s on 10+ medicines; multimorbid elderly see 5.7 clinicians/yr across 36 contacts |
| **Who is the user** | The patient | The adult child, 45–64, 61% female, 64% caring for a relative living elsewhere |
| **Who is the buyer** | The patient (same person) | Someone else — employer, insurer, ICB, or the family at a crisis moment |
| **Willingness to pay** | 5% willing to pay anything; median $28/mo (JCO Oncology Practice, 2025) | Same 5% DTC — but 86% of UK employers offer nothing, and L&G Care Concierge already funds a phone helpline (22,000+ contacts in 2024) |
| **Trigger event** | Diffuse ("I'm confused") | Hard and dated — hospital discharge. 291,000+ bed days lost to delayed discharge Nov 2025; 56% of carers not involved in the discharge decision |
| **Harm evidence** | Coordination burden, weakly quantified | 53% median medication-discrepancy rate post-discharge (54-study review); 2.13x hazard ratio for 30-day ED visit where discrepancies present |
| **Money on the table** | None specific | £24.1bn unclaimed entitlements 2025/26; £5.2bn Attendance Allowance across 1.1m households |
| **Regulatory exposure** | Lower — first-person, consented by definition | Higher — MCA 2005, proxy consent, LPA, third-party special-category data |
| **Build cost in 36h** | Baseline | Baseline + ~5h (consent layer, magic-link contributor, one extra artefact) |

**Faster path to revenue: elder care, and it isn't close.** Chronic illness has no buyer who isn't the user, and the published consumer WTP for navigation kills the subscription. Elder care has three funded, non-NHS buyers with existing line items (employer benefits platforms, later-life insurers, care providers as channel). The buyer moving off the user is the entire commercial argument.

**Better demo: elder care, also not close.** Chronic illness demos as "AI read my PDF and made a summary" — the single most common hackathon shape of 2026. Elder care demos as *reconciliation across people*: a spoken half-sentence from one human contradicting a PDF from another, resolved on screen with clickable provenance, plus a live revocation that empties three screens. Nobody else in the room will have a demo with two humans and a disagreement in it.

**Chronic illness wins exactly two things:** build simplicity, and a cleaner regulatory story. Both are purchasable — the regulatory delta is ~4 hours of consent work, and it is *itself* a demo asset.

**The honest caveat:** at a *consumer* health hackathon, elder care can read as admin software for the middle-aged. You mitigate that by opening on harm numbers (53% discrepancy rate, 2.13x ED hazard), not on paperwork — and by keeping a 25-second chronic-illness coda so the panel sees a patient using it for herself.

---

## 3. The winning concept: Handover (discharge cut)

### Scores

| Concept | Demo | 36h build risk | Engine reuse | Buyer clarity | Reg. safety | **Total** |
|---|---|---|---|---|---|---|
| **Handover — discharge cut** (conflicts → questions) | 9 | 7 | 9 | 8 | 8 | **8.5** |
| Handover — full spec (4 contributors, board, digest) | 9 | 4 | 8 | 8 | 7 | 7.5 |
| 72-Hour Discharge Pack (single carer, no multi-writer) | 6 | 9 | 10 | 7 | 9 | 7.5 |
| Care & Funding Brief (entitlement gap engine) | 8 | 6 | 6 | 9 | 5 | 7.0 |
| CHC 12-domain evidence mapper | 7 | 3 | 5 | 9 | 4 | 5.5 |
| Consent/proxy layer as the product | 4 | 8 | 3 | 5 | 10 | 5.5 |

### What it is

Sarah, 54, in Manchester, gets the call: her mother Margaret, 82, in Bristol, is being discharged after a heart failure admission. Sarah creates a person record, picks the trigger `discharged from hospital`, and dumps in everything the family holds: the discharge summary PDF, a phone photo of the repeat prescription slip, last spring's cardiology clinic letter. Before anything is readable, Handover phones Margaret's landline and takes a keypad consent. Sarah's dashboard stays empty until she presses 1 — enforced by RLS, not by UI.

Every source is decomposed into **claims** — atomic assertions each carrying a verbatim quote and a locator (page + offset for PDFs, millisecond offset for audio). Claims about the same subject are grouped deterministically, then adjudicated: same, superseded, or **in conflict**. Conflicts are first-class rows, never silently resolved.

The output is the existing CarePath appointment brief — with a new section at the top: *"Three sources disagree. Ask about these."* Each disagreement renders with clickable chips back to the exact line in the exact document, and one of the chips plays the actual audio.

### Three cuts I made to the full Handover spec, and why

1. **Killed the task board.** It's the commoditised surface (Lotsa Helping Hands, Caring Village, ianacare own it), it's the one in every screenshot, and its differentiation — no item is ever typed — is invisible in a static image. Conflicts become **questions on the appointment brief** instead. Same "nobody typed this" beat, routed into an artefact the PRD already builds (§19.3 call 6), and into the one output that serves patient, proxy *and* clinician simultaneously.
2. **Killed the paid-carer persona.** She's an agency employee whose employer's Digital Social Care Record is the legal record; the real-world story is a mess the demo makes look frictionless. She becomes "second family member," which needs no explanation.
3. **Killed the change digest.** Nice, not load-bearing, and it costs a third device and a live socket on venue wifi.

### Why it beats the others

- vs **72-Hour Discharge Pack**: identical build cost minus ~6 hours, but the demo is a summariser. No disagreement, no second human, no memorable beat.
- vs **Care & Funding Brief**: strongest buyer story, but it's a rules engine wearing a health product's clothes, it's financial-advice adjacent, and getting a benefits number wrong is a sharper harm than getting a clinical suggestion wrong because families act on it immediately. Take *one* piece of it (below), leave the rest.
- vs **CHC mapper**: highest-value artefact in UK elder care and genuinely unbuilt — and completely undemoable in 36 hours. Roadmap slide.

### The one thing I'm adding back from the funding concept

A single, deterministic, rules-only line at the end of the brief: **"Margaret may be eligible for Attendance Allowance. Higher rate is ~£114.60/week for 2026/27 and is not backdated — every week of delay is money lost. Here is the official checker: [gov.uk link]."** 45 minutes of work. It ends the demo on a number in pounds instead of a document. Never a verdict, always "may be eligible → official checker."
*Verify the rate against gov.uk before the pitch — £110.40 is the 2025/26 figure and will be wrong on stage.*

---

## 4. Shared engine: what's actually common

### The abstraction is not the pipeline

"Document → provenance-tagged fact → timeline → brief" is *nearly* right, but it's a pipeline description, and it hides the two things that actually differ between personas. The real shared abstraction is a single table:

```
Claim(
  subject_person_id,   -- WHO the claim is about
  source_id,           -- WHICH artefact it came from
  author_member_id,    -- WHO supplied that artefact
  claim_type,          -- medication | diagnosis | appointment | instruction | observation | contact | admin
  subject, value,      -- normalised
  asserted_at,
  quote, locator,      -- verbatim substring + page/char or ms offset
  confidence,
  superseded_by
)
```

**Everything upstream is a Source.** PDF, phone photo, voice note, typed diary entry, Juno chat log — one table, one `kind` enum. The chronic-illness path and the elder-care path differ only in which `kind` values show up.

**Everything downstream is a reduction over the claim set, not a separate pipeline.**
- Timeline = claims ordered by `asserted_at`, deduplicated
- Gap analysis = claims with no successor claim (the March referral with nothing after it)
- Conflict = two live claims, same normalised subject, incompatible values
- Current state = last-write-wins per subject, with conflicts flagged
- Appointment brief = a filtered projection with a human-confirmation gate
- Funding prompt = a deterministic rules pass over the claim set

### One codebase serves both, and here is the exact trick

**Model self-serve as the degenerate case of the carer relationship.** The chronic-illness patient is a `care_relationships` row where `member_id = subject_person_id`, `role = 'the_person'`, `access_basis = 'self'`, `granted_at = now()`, `revoked_at = null`. Maya gets a self-row on signup and never sees a consent screen. Sarah gets a carer-row and sees the full handshake.

Consequence: **one RLS policy covers both markets.**

```sql
create function has_care_access(p uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from care_relationships r
    where r.person_id = p
      and r.member_id = auth.uid()
      and r.granted_at is not null
      and r.revoked_at is null
  );
$$;
-- every table: using (has_care_access(person_id))
```

Zero forks in the engine. Zero forks in the prompts. The only genuine divergence is **UI copy** (first-person vs third-person) and **which reductions you render**. That's a template variable and a feature flag.

### PRD table mapping (from `/Users/yogi/Projects/careos-health-hack-juno/prd.md` §20)

| PRD table | Change |
|---|---|
| `profiles` | → `people`, add `created_by` (subject ≠ account holder) |
| `cases` | → `episodes`, add `trigger_type` enum |
| `documents` | → `sources`, generalise `kind`, add `author_member_id`, `transcript` |
| `timeline_events` | add `person_id`, `source_claim_ids uuid[]` |
| `clarification_questions` | **unchanged** — conflicts feed straight into it |
| `care_plans`, `appointment_briefs`, `follow_up_tasks`, `generation_logs` | **unchanged** |
| `consent_records` | already exists — extend, don't replace |
| **new:** `care_relationships`, `claims`, `claim_conflicts` | three tables |

Reuse verbatim: safety classifier and bounded route enum (§14.4), extraction (§19.3 call 2), timeline normalisation (call 3 — *already* outputs contradictions and duplicates, so the conflict surface is an extension not a new capability), clarification generation (call 4), appointment brief (call 6), the human-confirmation gate (§14.5), structured schemas (§23), and the language rules (§14.3).

**Realistic reuse: ~75% of engine effort. The delta is three tables, one RLS function, one voice loop, one conflict UI.**

---

## 5. Hackathon recommendation

> **Build CarePath. Demo it as elder care. Show the chronic-illness path as a 25-second coda.**

That is the cheapest way to own both markets in one demo, because the second market costs you *one extra screen and zero extra code* — the self-serve flow is the same engine with a self-relationship row, and the PRD already contains the synthetic dataset for it (Alex Morgan, §28).

**Amend `/Users/yogi/Projects/careos-health-hack-juno/prd.md` §7.3.** It currently reads *"Caregiver access should remain outside the hackathon MVP unless time permits."* Overturn that line: promote Priya to co-primary and make her the demo operator. Everything else in §7 stands.

### Hour-by-hour

| Hours | Work |
|---|---|
| **H0–2** | Write the three synthetic documents by hand and PDF them. Schema + RLS policies. **Schema first, always.** |
| **H2–6** | Source upload → claim extraction → substring-quote validation. One source type end to end. |
| **H6–9** | **The 90-minute engine test (§9). If it fails, fall back now, not at H30.** |
| **H9–14** | Deterministic grouping + reconciliation + `claim_conflicts` rows + the conflict card UI with clickable chips. |
| **H14–18** | Consent handshake: ElevenLabs outbound call, keypad confirm, SMS fallback, `care_relationships` row, revocation, Realtime subscription. |
| **H18–21** | Voice note capture on a magic-link page (no login). Word-level timestamps → audio provenance. |
| **H21–25** | Conflicts → clarification questions → appointment brief (reused from PRD call 6). Attendance Allowance line. |
| **H25–28** | Chronic-illness coda: seed Alex Morgan, self-relationship row, one screen. Copy toggle first/third person. |
| **H28–32** | Second device, second account. Dry-run the demo five times. `DEMO_FALLBACK=true` canned responses on any call >6s. |
| **H32–35** | Slides. RLS policy slide, not-a-medical-device slide, graveyard slide, buyer slide. |
| **H35–36** | **Do not write code. Rehearse.** |

### Cut order if time compresses
Chronic-illness coda → Attendance Allowance line → outbound consent *call* (degrade to SMS-with-a-code) → voice note *live capture* (degrade to pre-recorded). **Never cut provenance or consent.** They are the product.

### Live on stage vs pre-warmed
Live: the voice note recorded in the room, its transcription, claim extraction, the reconciliation that produces the conflict, and the revocation. Everything else pre-warmed. Venue wifi has killed more hackathon demos than bad code.

---

## 6. Demo persona and document set

**Margaret Ellis, 82, Bristol.** Widowed, lives alone in a terraced house. Admitted 21 June 2026 with breathlessness and ankle swelling; discharged 25 June. Daughter **Sarah Ellis, 54, Manchester** — marketing manager, two teenagers, the "default sibling." Son **James, 49, Leeds** — helps by phone. *All documents synthetic. Say so on the slide.*

### Doc 1 — NHS discharge summary (2 pages, PDF)

```
BRISTOL ROYAL INFIRMARY — DISCHARGE SUMMARY
Patient: Margaret ELLIS   DOB: 14/03/1944   NHS No: 999 000 1234
Admitted: 21/06/2026   Discharged: 25/06/2026   Ward: Cardiology (Ward 8B)

DIAGNOSIS
1. Decompensated heart failure (HFrEF)
2. Chronic kidney disease stage 3b
3. Type 2 diabetes mellitus

— page 2 —
MEDICATION CHANGES ON DISCHARGE
  line 12  Bisoprolol 2.5mg once daily — CONTINUE
  line 14  Furosemide 40mg — STOPPED prior to discharge due to
           worsening renal function. Do not restart without review.
  line 16  Dapagliflozin 10mg once daily — NEW, started 23/06/2026

ACTIONS FOR PRIMARY CARE
  line 21  GP to review renal function and diuretic requirement
           within 7 days of discharge.
  line 23  Daily weights; contact GP if weight rises >2kg in 3 days.

FOLLOW-UP
  line 27  Heart failure nurse to contact within 2 weeks.
```

### Doc 2 — Repeat prescription slip (phone photo, slightly angled, kitchen lighting)
Printed 03/07/2026 — **eight days after discharge**. Eleven items. Includes **Furosemide 40mg tablets — 28 days**. Also includes an item the discharge summary never mentions (e.g. Amitriptyline 10mg nocte) so the gap analysis has something to find beyond the headline conflict.

### Doc 3 — Cardiology clinic letter, 12 March 2026 (PDF)
Routine outpatient review. Echo: LVEF 40%. *"Continue furosemide 40mg daily. Review in six months."* Signed Dr A. Okafor, Consultant Cardiologist. **This is the second, quieter find:** the six-month review falls due in September, nobody has booked it, and the letter's instruction is now superseded — which is exactly what "gap analysis" means when it's a statement about the record rather than a clinical judgement.

### Doc 4 — Voice note, recorded live on stage
A teammate holds a phone, opens the magic link, presses one button, and says one ordinary sentence:

> *"Morning visit done — Mum was a bit wobbly on the stairs, and she says she's still taking her water tablet at bedtime like always."*

### The 40-second beat
Eight seconds later: that sentence is a structured, timestamped, attributed observation on the shared timeline. Beneath it a conflict card opens — **three sources disagreeing about furosemide**, three clickable chips: discharge summary p2 line 14, the prescription photo, and the voice note at 00:06 (click it, her actual voice plays). The appointment brief regenerates with a new top-line question nobody typed: *"Three sources disagree about the water tablet (furosemide). Ask whether it should have been restarted."* Then the phone on the table rings, someone presses 1, and every screen empties.

### Chronic-illness coda (25 seconds)
Switch account. **Alex Morgan, 38** — the PRD's existing §28 dataset, ankle MRI, four Juno diary entries. Same screen, same engine, first-person copy, no consent step. *"Same product. She's doing it for herself."* Costs you nothing because the dataset is already written.

---

## 7. Elder-care safety layer

### 7.1 Capacity — four rules, no exceptions

1. **Never assess capacity.** MCA 2005 principle 1: assume capacity unless established otherwise, and incapacity is a clinical determination. The app records an *asserted legal basis*; it never evaluates one.
2. **Default path is elder-initiated consent.** There is no "my parent can't consent" shortcut on the happy path. The lacks-capacity route is a separate, friction-heavy branch.
3. **Four access bases only**, copied verbatim from NHS England proxy-access guidance: `person_consent | lpa_health_welfare | court_deputy | best_interests_declared`. Show an Office of the Public Guardian register-check link for the LPA route (stub the call, keep the UI — the register check is free and real).
4. **`best_interests_declared` is gated or omitted.** In a consumer app with no GP, offering it means letting a carer self-certify. Either omit from MVP or require a typed declaration *plus* mandatory notification to the elder. My call: keep it, gate it, and say on stage that you know it's the weak one.

### 7.2 Consent copy — use these strings

**Outbound voice call (ElevenLabs → Margaret's landline):**
> "Hello. This is Handover, calling on behalf of Sarah Ellis. Sarah has asked to help you keep track of your medical letters and appointments. If you agree, Sarah will be able to see letters and information about your care, and prepare notes for your doctor's appointments. She will not be able to change anything in your NHS record. You can stop this at any time by calling this number and pressing 9. To agree now, press 1. To say no, press 2. If you would like time to think, press 3 and we will call again tomorrow."

**SMS fallback:**
> "Sarah Ellis has asked to help manage your medical letters using Handover. Reply YES to allow, or NO to decline. You can stop at any time by replying STOP. Handover cannot change your NHS record."

**Carer-side declaration (typed name, not a checkbox):**
> "I confirm I am acting for Margaret Ellis with her consent. I understand Margaret will be told each time I view or export her information, and that she can end my access at any time without needing my agreement. Type your full name to confirm."

**Persistent access-basis badge on the carer dashboard:**
> "Access basis: Margaret's consent, given by phone, 25 Jul 2026 at 14:12. Margaret can end this at any time."

**What the carer sees on revocation:**
> "Margaret has stopped sharing. Her information is no longer available here. Nothing has been deleted — Margaret can restart sharing whenever she wants."

**Legal copy on the landing page and on a slide (10 minutes, separates you from every other team):**
> "No secondary use. No data sold. No research sharing. No model training on your documents. Full delete on withdrawal. The person the records are about can see everything their carer sees."

### 7.3 Safeguarding — passive only

You acquire **no** statutory duty; Care Act 2014 s.42 sits with local authorities. But surfacing neglect signals creates a moral obligation to signpost.

- **Never** auto-escalate. The California fall-detection pilot — false alarms triggering unannounced social-service visits, leaving the resident "surveilled and powerless" — is the exact shape of the harm.
- **Never** claim to detect abuse.
- **Always** render a passive, always-available footer:
> "Worried about someone's safety? If someone is in immediate danger, call 999. To raise a concern about an adult at risk, contact adult social care at their local council — enter a postcode to find the number. Handover does not report concerns for you, and does not monitor anyone."

### 7.4 Medication red flags — the sharpest line in the build

The conflict card is simultaneously your best demo moment and your closest approach to being a regulated medical device. The CJEU *Snitem/Philips France* ruling, cited in MHRA guidance, makes drug-interaction and dose-checking software a device with no ambiguity.

**The rule: state facts about documents. Never compute a clinical judgement.**

| Allowed (statement about the record) | Banned (medical device) |
|---|---|
| "Three sources disagree about furosemide." | "These two medicines interact." |
| "The discharge summary (25 Jun, p2 l14) says it was stopped." | "This dose is too high." |
| "The repeat prescription list dated 3 Jul still includes it." | "Margaret should stop taking furosemide." |
| "A voice note from 24 Jul says she is still taking it." | "This is the most urgent issue." |
| "This is a question for the pharmacist or GP." | Any severity, risk, or red-flag label. |
| "The record shows no follow-up after the March review." | "This is the most concerning gap." |

**Three enforcement layers, because a prompt instruction is not a control:**

1. **Schema-level.** No `severity`, `rank`, `urgency`, `risk` or `priority` field exists in any structured-output schema. The model physically cannot express prioritisation. (MHRA draws the device line precisely at prioritisation: ordering independent of likelihood is out of scope; ranking by likelihood or severity is in scope.)
2. **Substring kill switch.** After every extraction call, assert `normalise(source.text).includes(normalise(claim.quote))`. Any claim whose quote is not a literal substring of its own source is **dropped, not flagged**. ~20 lines of TypeScript, deterministic, testable, demoable: *"312 claims extracted, 4 dropped for unverifiable quotes."* Note the API constraint: Anthropic's native citations cannot be combined with `output_config.format` — use strict tool-based extraction plus your own check.
3. **Regex post-filter on every generated string.** Ban list: `triage`, `medical advice`, `assessment`, `risk score`, `urgent`, `diagnosis`, `recommendation`, `you should`, `interact`. Prefer: `organise`, `prepare`, `what the record shows`, `these sources disagree`, `questions to ask`. **Your UI copy is evidence of intended purpose to both MHRA and CQC — write it like a regulator will read it, because one might.**

### 7.5 Hard non-goals — add to prd.md §6 and say out loud

No falls risk score. No frailty score, CFS or eFI. No drug-interaction or dose checking. No deprescribing suggestion. No severity or red-flag label. No ranking of concerns by urgency. No location tracking. No passive sensing. No wellness dashboard. No automated safeguarding referral. No alert to a family member the elder cannot see. No shared calendar. No sibling chat.

**Pitch line:** *"We help families prepare for the appointment they already have. We do not watch your mum."* Every documented elder-tech trust failure is a monitoring product. CarePath is structurally not one — protect that.

### 7.6 The honest answer when a DPO-shaped judge attacks the consent flow

Do not oversell the handshake. If the lead sibling sets up the account, chooses the access basis, and is holding Mum's phone when the call comes, the consent is worthless under the ICO's power-imbalance test. Say so first:

> "The out-of-band call raises the cost of coercion; it doesn't eliminate it. What actually bites is that Margaret can revoke unilaterally without Sarah's agreement, that she's notified on every view and export, and that the access basis is on screen at all times. Consent capture is the weakest of those three, and we know it."

That answer wins more points than the feature does.

---

## 8. What this unlocks after the hackathon

**Months 0–1 — evidence, not revenue.** Three real families, free, recruited through a local Carers UK / Age UK / Carers Trust branch (5.8m carers in the UK; someone in the room is one degree away). Instrument two numbers: time from upload to a clinician-ready brief, and number of document disagreements surfaced per family. Those two numbers are the entire sales deck.

**Months 1–3 — the first cheque: a UK employer, via a benefits platform.** 500–5,000 employees, £5–15k pilot, sold to Reward/Benefits — *not* clinical, so no medical-device gate, no DTAC, no clinical safety case. The category is proven (Seniorcare by Lottie, KareHero, both distributing through Zest) and 86% of UK organisations have nothing; only 5.7% run a dedicated care-support programme. Trigger events: Carer's Leave Act 2023 in force since April 2024, and the paid-carer's-leave consultation closing 1 September 2026. Benefit-channel buyers are the least price-sensitive segment in this market.

**Months 3–6 — the bigger cheque: a later-life insurer, white-labelled.** Name it on the pitch slide: **Legal & General Care Concierge** — free to Annuity, Lifetime Mortgage, Workplace Pension, Group Protection and Retail Protection customers, 22,000+ contacts in 2024, operating *predominantly as a telephone helpline*, remit widened January 2025 from later-life care to all adults with support needs. You are not asking for a new budget. You are selling cost-per-contact reduction into an existing line item: Claude does the document first pass a human coach currently does by hand. Same shape for Aviva, Bupa, equity-release lenders and SOLLA-accredited care-fee planning firms.

**Months 3–6, parallel — non-dilutive.** SBRI Healthcare, up to ~£200k net for 12 months, on the discharge/readmission theme. Treat NHS as grant income and credibility, not as a customer: NHS England has confirmed no separate digital tools funding in 2026/27, PCARP has ended, and the £300m digital pathways framework has been suspended since February 2024. Comparable ICB frailty/discharge contracts run around £200k over three years. Let the ICB logo sell the insurer.

**The pitch-slide differentiator, one sentence:** *Wellthy ($78M), Cariloop ($43.1M) and Homethrive ($58.5M) sell human care coaches. Grayce wound down in November 2025 and handed its clients to Cariloop. We do the document synthesis those coaches do by hand, at near-zero marginal cost.*

**The graveyard slide, three logos:** CareZone ($168M raised, 3M users, tech sold to Walmart, app dead Jan 2023). Papa ($1.4B peak, ~36 payer contracts lost). Forward Health ($650M, ~5 of 3,200 CarePods deployed, all clinics shut). **Rules learned: no humans in the home. No consumer pill-tracker subscription. Software that produces a defensible document for a payer with an existing budget.** Reading the graveyard out loud is the single most commercially mature thing you can do in a three-minute pitch.

**Explicitly not doing:** a £20/month DTC subscription (CareZone owns that headstone; published WTP is a median $28/mo among the 5% willing to pay at all). Care-home placement matching (Lottie has 6,000+ services and 18 of the top 20 groups, and the £3–6k placement commission creates the exact impartiality conflict your credibility depends on). Anything with humans in the home.

**Do not sum £184.3bn, £42bn and £47.7bn.** They overlap heavily — unpaid care is 50% of the dementia total. And date-stamp the falls £2.3bn (traces to 2010–2013, not inflation-adjusted) and the £300m medicines-waste figure (Trueman 2010) if you use them at all.

---

## 9. Biggest risk, and the cheapest test

### The risk is not regulatory. It is that the engine is shallow.

Consent, capacity and the device line are all solvable with hours you can budget. The failure that actually kills you is: **the reconciliation works beautifully on three documents you wrote by hand, and on nothing else.** You ship a gorgeous conflict card and a pipeline that generalises to zero real inputs. Real paperwork is faded fax-quality discharge letters, handwritten annotations, decade-old records, and photos taken at an angle in bad light. A judge hands you their mother's actual folder and the demo dies in public.

The second-order version: `Where Things Stand` / the medication list is the most dangerous artefact you will build. An authoritative-looking, LLM-assembled medication list carried by an anxious daughter into a real appointment. Provenance links make the output *auditable* without making it *complete* — **a claim you never extracted has no chip to click.** Frame it relentlessly as "what your documents say," never as a medication list, and show the *"I couldn't read this section"* state deliberately rather than hiding it.

### The cheapest test: 90 minutes, at H6, before you write a single line of UI

1. Assemble **10 documents you did not write.** Published NHS/PRSB exemplar discharge summaries, sample clinic letters, and — critically — three phone photos taken in bad light at an angle. Ask two teammates for a redacted letter from a relative.
2. Run **only** the extraction call plus the substring-quote check. No UI, no database, no reconciliation.
3. Plant one deliberate contradiction across two of them.
4. **Pass bar:** ≥70% of extracted claims survive the substring check, and the planted contradiction is found in ≥8 of 10 runs.

**If it passes**, you have a product and the rest is engineering. **If it fails**, you have a UI, and you fall back at H7 — not H30 — to the 72-Hour Discharge Pack (single carer, single document, appointment brief out, score 7.5). That fallback is a fine hackathon entry. Discovering you need it at hour thirty is not.

### The second cheapest test: five minutes, free

Find one person at the hackathon with a DPO, clinical-governance or social-work background and ask them to attack the consent flow. They will find the coercion hole in ninety seconds. Better them than a judge — and their exact wording becomes your answer.

---

**Source PRD:** `/Users/yogi/Projects/careos-health-hack-juno/prd.md` — amend §6 (add elder-care non-goals from 7.5), §7.3 (promote Priya to co-primary operator, delete the "outside the MVP" line), §20 (three new tables), §28 (add the Margaret Ellis dataset alongside Alex Morgan).