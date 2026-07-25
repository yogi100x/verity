# CHC as the Wedge — Verdict, Build Plan, Commercial Path

*Synthesis of this session's CHC/entitlements/insurance research against the team's two prior decision documents: `/Users/yogi/Projects/careos-health-hack-juno/research/01-carepath-market-and-build.md` (GP appointment brief) and `/Users/yogi/Projects/careos-health-hack-juno/research/02-eldercare-opportunity.md` (hospital discharge / "Handover"). Both are good, adversarially-tested work — this document overrules parts of both with reasons given, not by ignoring them.*

---

## 1. Verdict

Rank: **CHC evidence bundle > hospital discharge (Handover) > benefits (PIP/Attendance Allowance) > GP appointment brief > insurance claims** — the first three have a payer who isn't the patient and a document-density problem an LLM actually solves, while the last two either have no institutional payer (GP brief: proven ~5% consumer willingness-to-pay, median $28/mo) or too small a dispute volume to matter (insurance: ~4,000–5,000 FOS cases/year nationally against PIP's 3.6–3.7m claimants). **Build the CHC evidence bundle this weekend**: it is the only wedge with a public, paragraph-numbered rubric a judge can pull up on their own laptop and verify live, a collapsing eligibility rate (31%→17%) that makes the "why now" case for free, and a real paid-advocacy market (Beacon, Compass CHC, Hugh James) with zero AI-native competitor. **The money is in the discharge/elder-care channel**: it is the same engine sold to buyers who already have a budget line to displace — employer benefits platforms (Zest, Lottie) and insurers (L&G Care Concierge, 22,000+ contacts/year) — rather than to a grieving family's credit card, so the 6-month plan is CHC-grade evidence extraction sold two ways: direct to CHC advocacy firms as a caseworker-time compressor now, and bundled into the discharge/elder-care product as a premium tier once that channel exists. Close the demo by generating a second artifact — a GP appointment brief — from the identical record, because "one engine, any gatekeeper" is the one claim in this whole pitch that no competitor can say back to you.

Do not build Handover's multi-contributor consent/telephony flow this weekend — it answers a different question (who's allowed to see this) than the one the hackathon needs to prove (can we extract this correctly) — but keep its buyer story as the commercialisation path and its persona archetype as the demo template for CHC.

---

## 2. CHC explained for a builder

**Framework version:** *National Framework for NHS Continuing Healthcare and NHS-funded Nursing Care, July 2022 (Revised)*, implemented 1 July 2022, corrected July 2023 (para 59 only). This is the document every citation below points at.

**Process — four stages, hard timescales:**
1. **Checklist** — 11 domains (excludes "Other significant care needs," which is DST-only), rated A(high)/B(moderate)/C(no-low) by a trained health/social-care professional. **Not self-completable.** Positive-Checklist trigger (Age UK Factsheet 20): 2+ A's, OR 5+ B's, OR 1 A + 4 B's, OR an A in a Priority-capable domain plus any level elsewhere. Positive → full assessment. Negative → family can ask the ICB to reconsider.
2. **Decision Support Tool (DST)** — 12 named domains, scored by a Multidisciplinary Team (MDT) of 2+ professionals from different disciplines. Disagreement → guidance says select the **higher** level and record the dispute.
3. **MDT recommendation** — a written judgement on "primary health need," addressing all four key characteristics explicitly.
4. **ICB decision** — must follow the MDT recommendation "except in exceptional circumstances, for clearly articulated reasons" (para 173); finance officers must not sit on the decision panel. ICB responds within **48 hours / 2 working days** of the MDT recommendation. Checklist-to-decision target: **28 calendar days**.

**Fast Track** bypasses Checklist/DST entirely for rapid deterioration/end-of-life: one appropriate clinician completes the Fast Track Pathway Tool; a correctly completed form is itself sufficient for eligibility; ICB should arrange care "ideally" within 48 hours.

**The 12 DST domains, exactly as named, with level ceiling:**

| Domain | Ceiling |
|---|---|
| Breathing | **Priority** |
| Behaviour | **Priority** |
| Drug therapies and medication | **Priority** |
| Altered states of consciousness | **Priority** |
| Nutrition (food and drink) | Severe |
| Skin integrity / tissue viability | Severe |
| Mobility | Severe |
| Communication | Severe |
| Psychological and emotional needs | Severe |
| Cognition | Severe |
| Other significant care needs (DST only, not on the Checklist) | Severe |
| Continence | **High** (no Severe/Priority level exists) |

Level scale where it applies: No needs / Low / Moderate / High / Severe / Priority.

**Eligibility logic — the "primary health need" test, four key characteristics (paras 55–67):**
- **Nature** — the particular characteristics of the need and the *quality* of intervention required.
- **Intensity** — the *quantity* and *degree* of the need, including sustained/ongoing care ("continuity").
- **Complexity** — how needs interact to increase the skill required to monitor, treat, or manage.
- **Unpredictability** — the degree to which needs fluctuate; a fluctuating, unstable, or rapidly deteriorating condition.

Para 61: *"Each of these characteristics may, alone or in combination, demonstrate a primary health need."* The common rule-of-thumb — a Priority level in one domain, or two Severe levels, "would normally indicate eligibility" — is a heuristic, **not the legal test**. The four-characteristics judgement is the actual test. Build accordingly: never let the product substitute the heuristic for the judgement.

**The well-managed-need principle — the single highest-leverage citation in the whole Framework.** Para 162, verbatim: *"The decision-making rationale should not marginalise a need just because it is successfully managed: well-managed needs are still needs. Only where the successful management of a healthcare need has permanently reduced or removed an ongoing need... will this have a bearing on NHS Continuing Healthcare eligibility."* Para 128: applies equally at Checklist as at DST. Para 164: where routine records don't capture management effort, ask for a diary "over a suitable period of time" demonstrating nature/frequency/effectiveness of intervention. Para 166: don't misuse the principle to pretend a well-controlled condition (medication-controlled behaviour, good continence care) has no support in place — score the support itself in the relevant domain. Para 208: reviewers must not misread "well-managed" as "reduced," especially with progressive conditions.

**Reviews, appeals, retrospective claims:** First review within 3 months of the decision, then annually; reassessment only on clear evidence of material change. Appeal ladder: Local Resolution (request within 6 months of the decision letter) → Independent Review Panel (request within 6 months of the LR outcome, ~6-week evidence window, independent chair + out-of-area ICB rep + LA social-services rep, accepted "in all but exceptional circumstances") → Parliamentary and Health Service Ombudsman (final stage; of 336 CHC cases decided Apr 2018–Jul 2020, 150 were investigated and 55 found failings — the only hard PHSO stat sourced this round). Retrospective (PUPoC) claims: for periods after 1 April 2012, good-practice processing targets of 6 months (disputed period ≤1yr) or 12 months (>1yr). NHS-funded Nursing Care (FNC) sits below CHC, only considered once CHC is ruled out, covers registered-nurse input only: **£267.68/week (standard band) / £368.24/week (legacy high band), FY2026/27.**

**Figures I could not verify — flag these in the product and in any pitch deck:** the FY2025/26 prior-year FNC rate; Scotland/Wales/Northern Ireland CHC-equivalent processes and rates (keep the product England-only); average UK care-home cost (do not invent an annual £ figure); the precise CHC eligibility-rate collapse (31%→17%) and the CHC-population-halving figures (~104,400→~52,096) are from secondary aggregation (Care Advocate, Nuffield Trust via press coverage), not independently re-fetched from a primary NHS England release this session — directionally credible, cite as such; any Local Resolution/IRP/PHSO success-rate percentage beyond the one sourced PHSO window above; whether the Dilnot £86k lifetime care-cost cap was actually cancelled (general knowledge only, not re-verified — the safest claim is "no lifetime cap appears in current guidance," not "the cap was cancelled").

---

## 3. Where families lose, and what software fixes

| Where families lose | Product mechanism | Build scope |
|---|---|---|
| Checklist never requested, or done prematurely on an acute ward (para 104) | Onboarding prompt: "you can request a Checklist directly from the ICB, with or without staff prompting" + one-click request letter | Weekend |
| "Well-managed" needs read by an assessor as "no needs" | Well-managed-need detector: stability language ("settled," "no incidents," "stable on medication") co-occurring with active-intervention evidence (PRN meds, 2-hourly prompted care, hoist transfers) → auto-flag, verbatim para 162/163–166 citation, prompts a targeted follow-up question | **Weekend — the headline feature** |
| Assessor's DST narrative understates or omits what source records show; rationale leans on excluded factors (diagnosis, care setting, who provides care — explicitly banned by para 66) | DST-diff / audit: cross-reference an uploaded, completed assessor DST against the extracted evidence corpus | Roadmap — needs OCR of a second complex NHS form, explicit stretch-skip |
| Vague, undated evidence discounted vs specific, dated, scored evidence | Canonical-evidence checklist per domain (Waterlow/MUST/FRASE/SALT extracted as first-class numeric fields, not folded into prose) + gap-finder + one-click request letters | Weekend |
| Appeals not framed in the Framework's own vocabulary | Every domain narrative auto-structured as Nature / Intensity / Complexity / Unpredictability sub-paragraphs, each sentence cited to a source | Weekend |
| Families miss the 28-day statutory clock and the Annex E refund entitlement | Deterministic delay clock (`today − checklist_positive_date` vs 28 days) + auto-drafted refund letter | Cheap, but cut for time — roadmap slide only |
| PUPoC awareness gap — families don't know retrospective claims exist | Case-stage picker includes "retrospective claim"; one onboarding prompt: "was there a period before this where needs may already have qualified?" | Roadmap, mention only |
| Evidence assembled last-minute against the 6-month LRM deadline | Statutory-clock tracker with deadline nudges across the whole appeal ladder | Roadmap |
| Postcode-lottery — outcome depends on which of the 42 ICBs and which assessor a family draws | Not fixable by software | Positioning, not a feature — say "you can't choose your assessor, you can standardise what they're given" on stage |

---

## 4. Market sizing

Legend: **[S]** primary source fetched this research round. **[Sec]** secondary/aggregator source, not independently re-fetched — directionally credible, cite with attribution. **[Unverified]** explicit gap.

### NHS Continuing Healthcare
| Metric | Figure | Status |
|---|---|---|
| Adults eligible, Q1 2025/26 snapshot | 50,281 | NHS Parliament written answer, 13 Oct 2025 **[S]** |
| Eligible in Q2 2025/26 | 28,754 (2,174 via Standard route, 26,580 via Fast Track); YTD cumulative 106,909 | NHS England CHC Statistical Press Release Q2 2025/26 **[S]** |
| Full-assessment eligibility rate | 31% (2017) → 17% (early 2026) | Care Advocate / House of Commons Library aggregation **[Sec]** |
| People receiving CHC funding | ~104,400 (2021/22) → ~52,096 (Mar 2024) | Nuffield Trust via press coverage **[Sec]** |
| Annual CHC spend | £6.5bn (2023/24) | Care Advocate summary of NHS England data **[Sec]** |
| Regional variation | 20–95 eligible per 50,000 adults by ICB (~4–5x) | Nuffield Trust analysis, Sept 2025 **[Sec]** |
| Value per case | 100% NHS-funded, uncapped, vs means-tested above £23,250 upper capital limit | National Framework para 9; Age UK Factsheet 10 **[S]** |
| Avg. PUPoC (retrospective) recovery | ~£30,000 (implying avg. solicitor fee ~£7,500+VAT at 25%+VAT contingency) | Hugh James, hughjames.com **[S]** |
| PHSO CHC casework, Apr 2018–Jul 2020 | 336 decided, 150 investigated, 55 failings found (~37% of investigated) | ombudsman.org.uk **[S]** |
| PUPoC requests from 2012 restructuring | ~63,000 | ombudsman.org.uk **[S]** |
| Incumbent pricing (proof of WTP) | Beacon: £1,400–£4,000/case fixed fee, £230+VAT/hr. Hugh James: 25%+VAT contingency, >£200m recovered since 2006, 6,000+ families | beaconchc.co.uk, hughjames.com **[S]** |

### Personal Independence Payment (PIP)
| Metric | Figure | Status |
|---|---|---|
| Claimants | 3.6–3.7m | gov.uk PIP official statistics **[S]** |
| New-claim award rate | 41% (Q2 2025), down from 46% YoY — i.e. ~59% refused first time | gov.uk **[S]** |
| Mandatory Reconsideration overturn rate | ~20–25% | benefitsandwork.co.uk **[Sec]** |
| First-tier Tribunal overturn rate | 63–70% (66% per HMCTS Q4 2024/25) | pipappeal.org.uk / HMCTS **[S]** |
| Tribunal backlog | 53,000 (Q2 2025/26), ~4x four years earlier | mirror.co.uk / HMCTS **[Sec]** |
| Claimants who lose at MR and never appeal | ~65% | benefitsandwork.co.uk **[Sec]** |

**The single best headline stat in this entire document**: MR overturns 20–25%, Tribunal overturns 63–70%. Same claimant, same facts, wildly different outcome depending only on how much evidence gets assembled and when. That gap is the product thesis stated as a number.

### Attendance Allowance
| Metric | Figure | Status |
|---|---|---|
| Current claimants | ~1.9m | carersuk.org **[Sec]** |
| Eligible pension-age households not claiming | ~1.1m+ | moneymagpie.com **[Sec]** |
| Estimated unclaimed, per year | ~£5.2bn | moneymagpie.com **[Sec]** |
| Rates from April 2026 | £76.70/wk (lower) / £114.60/wk (higher) ≈ £3,988–£5,959/yr, tax-free | carersuk.org, gov.uk **[S]** |
| Decision process | AA1 paper form only, **no interview** — the whole decision rests on what's written on the form | gov.uk **[S]** |
| "Over half of applications rejected" | Single uncorroborated source | **[Unverified]** |

### Carer's Allowance
| Metric | Figure | Status |
|---|---|---|
| Weekly rate | £81.90 (2025/26, ~£4,258/yr) | carersuk.org **[S]** |
| Total DWP annual spend | >£4bn | NAO DWP Overview 2024/25 **[S]** |
| New earnings-related overpayments, 2025/26 | 32,559 despite reform | Guardian, 18 Jul 2026 **[S]** |
| Cliff-edge mechanism | £151/wk threshold; £1 over triggers 100% clawback of that week's full award | gov.uk / Sayce Review **[S]** |

### Context topline
Total unclaimed income-related benefits, Great Britain 2025/26: **£24.1bn across 7m+ households** (Universal Credit alone £11.1bn) — Policy in Practice "Missing Out 2025," Sept 2025 **[S]**. Use this on a slide as market size; note it's dominated by pure means-tests (UC, Council Tax Support), not the document-evidence-heavy slice this engine actually serves.

**For contrast**, insurance disputes reaching the Financial Ombudsman Service across PMI+income protection+critical illness+term+whole-of-life total roughly **4,000–5,000 cases/year nationally** — orders of magnitude below PIP alone. This is why insurance is ranked last and not built.

---

## 5. The shared engine

The abstraction is **Source → Claim → Fact → (Conflict) → Artifact**, not "evidence → fact → artifact." Claim must come before Fact: a Claim is cheap, atomic, source-anchored, and disposable (one per extraction, can be wrong, gets dropped). A Fact is the reconciled, provenance-carrying unit an Artifact is *allowed* to cite, and it only exists once claims are deterministically grouped. This ordering is what makes "no assertion without a citation" a structural invariant instead of a prompt-engineering hope.

```ts
type Provenance = 'user_stated' | 'document_extracted' | 'system_inferred' | 'unknown';

Source   { id, person_id, kind, storage_path, transcript, transcript_confidence }
Claim    { id, source_id, quote, locator, ontology_key, value, value_as_of,
           provenance, verified_substring: boolean }        // false ⇒ dropped, never surfaced
Fact     { id, person_id, ontology_key, canonical_value, provenance, confidence,
           status: 'confirmed'|'disputed'|'unknown', valid_from, valid_to,
           supporting_claim_ids: string[], conflict_id? }    // empty only if status='unknown'
Conflict { id, ontology_key, claim_ids: string[], resolution: 'unresolved'|'user_resolved' }

ArtifactTemplate {                 // DATA, not code — this is what makes one engine serve 4 gatekeepers
  key: 'gp_brief_v1' | 'chc_dst_pack_v1' | 'discharge_pack_v1' | 'aa1_narrative_v1',
  sections: { key, title, slots: Slot[] }[]
}
Slot { key, ontology_match: string[], min_provenance?, citation_required, renderer,
       gap_prompt?: string }        // shown when the slot can't be filled — never fabricated instead
```

`ontology_key` for the CHC template is one of the 12 DST domain keys; for the GP brief it's `reason_for_visit` / `history` / `what_changed` / `questions`; for a discharge pack it's medication/follow-up/red-flag keys; for an AA1 narrative it's day-supervision/night-supervision/mobility keys. **Same renderer, different rows** — adding a fifth gatekeeper is a seed-data change, not a new code path.

**Citation integrity — three independent layers, because a prompt instruction is not a control:**
1. **Schema-forcing.** The extraction call is a forced tool-use call. `quote` and `locator` are non-optional. There is no `severity`/`eligible`/`score` field anywhere in the schema — the model cannot express a judgement because there is no slot to put it in.
2. **Substring kill-switch.** Immediately after every extraction call: `normalise(source.transcript.slice(locator)).includes(normalise(claim.quote))`, plain deterministic code. Any Claim that fails is set `verified_substring=false` and dropped — never shown, never retried silently. This produces a real, demoable, non-hallucinated number: *"312 claims extracted, 4 dropped for unverifiable quotes."*
3. **Artifact-render gate.** A slot renders only if it resolves to a Fact backed by ≥1 Claim with `verified_substring=true`; otherwise it falls through to `gap_prompt`, never to fabricated prose. A DB-level constraint (an assertion row cannot be marked `citation_verified=true` without a non-empty join to its supporting facts) makes this a database-level impossibility, not an application convention. A shared banned-terms regex (`eligible`, `Priority level`, `meets the criteria`, `you should`, `diagnosis`) runs on every generated string before it can pass.

This same kernel is what should have shipped for the GP brief and would ship for a discharge pack — build it once, generically, and CHC is simply the first (and best-differentiated) `ArtifactTemplate` row.

---

## 6. Regulatory verdict

| Use case | Verdict | Why |
|---|---|---|
| **CHC** | **GO-WITH-CONSTRAINTS** | Outside Legal Services Act reserved activities (confirmed, legislation.gov.uk — only 6 activities reserved, none of which cover evidence assembly or letter-drafting) and outside FCA claims-management scope. Real exposure is negligent-misstatement/contract liability if a family relies on a wrong extraction, UK GDPR Art.9 proxy-consent validity (MCA 2005/LPA), and Care Act s.42 safeguarding optics (no statutory duty on the operator — confirmed via legislation.gov.uk — but constructive-knowledge exposure once the pipeline surfaces a neglect-shaped pattern). |
| **Benefits (PIP/AA/CA)** | **GO** | Cleanest of the three. Welfare-benefits advice is entirely unregulated — no FCA licence, no SRA licence, lay representation is explicitly permitted at SSCS tribunals (the Turn2us/Citizens Advice/entitledto precedent). Same GDPR/MCA proxy-consent constraints as CHC. |
| **Insurance (PMI/CI/travel)** | **GO-WITH-CONSTRAINTS, trending AVOID as a standalone commercial product** | The only one of the three sitting inside a specific UK regulatory perimeter. Safe only as a strictly self-serve, non-agentic, non-contingent-fee document-assembly tool; get it lawyer-checked before charging money. Don't build this weekend. |

**FCA claims-management answer:** regulated claims-management activity (FCA, since April 2019, under FSMA RAO Part XX) covers claims "under a contract of insurance," plus personal injury, financial mis-selling, housing disrepair, industrial-injuries disablement benefit, and criminal-injuries compensation. **NHS CHC and DWP benefits are not on that list** — they sit outside the FCA CMC perimeter entirely, regardless of automation. Insurance *is* on the list, and the decisive variable is agency: activity done FOR or ON BEHALF OF the claimant — contacting the insurer, negotiating, submitting, charging a contingent fee — is what's targeted. A purely self-service tool where the family uploads, generates, and clicks "send" themselves sits closer to document-assembly software (analogous to will-writing software) than to a CMC. This reading was not freshly re-verified against the live FCA Handbook this research round — treat as high-confidence established practice, not a fresh citation, and get it confirmed by a compliance lawyer before ever charging money for the insurance use case.

**Disclaimer copy — ship these verbatim.**

*In-app banner, pinned, CHC/benefits:*
> This tool organises evidence you already have against the official NHS Continuing Healthcare framework. It does not decide, predict, or guarantee eligibility, and it is not clinical, legal, or financial advice. Every fact is labelled by where it came from. Nothing is sent to the ICB or anyone else without you reviewing and choosing to submit it. If you're doing this for someone else, please confirm you have their consent, or hold a registered Lasting Power of Attorney (Health & Welfare) or Court of Protection deputyship. If anything here raises a safety concern, contact the local authority adult safeguarding team directly, or 999 in an emergency — we are a document tool, not a safeguarding authority.

*PDF cover disclaimer:*
> Generated by [Product] on [date] for [Subject Name]. This document is a structured, source-cited summary of evidence supplied by the family/carer. It does not constitute a clinical assessment or a determination of NHS Continuing Healthcare eligibility — that judgement belongs to the Multidisciplinary Team under the National Framework for NHS Continuing Healthcare (July 2022, revised). Every fact below carries its source and provenance tag. Proposed domain levels are suggestions only, to help you check completeness — never a prediction of outcome. Consider sharing this pack with an independent adviser (e.g. Beacon, 0345 548 0300, funded by NHS England) before an appeal or Independent Review Panel submission.

*Insurance (roadmap only — do not ship without legal review):*
> This tool helps you organise your own evidence for an insurance claim or complaint. It is not a claims management service — we do not act as your agent, contact or negotiate with your insurer, submit on your behalf, or charge a fee tied to your claim's outcome. It is not financial, legal, or medical advice. For significant sums, consider the free Financial Ombudsman Service or independent regulated advice before relying on this output.

---

## 7. What to build in 30 hours

**Two gatekeepers, one persona, single operator.** Build the CHC Evidence Pack as the primary artifact; close by regenerating a GP Appointment Brief from the identical record. Do **not** build Handover's outbound-call/multi-contributor consent flow this weekend — real differentiator for the discharge product, wrong bet to prove "does the extraction engine work," and it adds telephony as a live-demo failure point for no proof-of-concept value this round.

**Minimum feature list (nothing else ships):**
1. Ingestion: PDF upload, photo upload, pasted text, one voice-note transcript (pre-recorded, not live-captured on stage).
2. Extraction endpoint: document → `Claim[]` with quote + locator + `ontology_key` mapped to one of the 12 DST domains + provenance tag, per the Section 5 schema.
3. Provenance-tagged record view: colour-coded table/timeline, filterable by domain.
4. 12-domain coverage dashboard: evidence count + provenance mix + status (covered/thin/gap) per domain, proposed level labelled **"suggested, not determined"** — never an eligibility score or percentage anywhere in the UI.
5. Well-managed-need detector: stability language + co-occurring active-intervention evidence → flag + verbatim para 162 citation, gated behind a **human-confirm click** before it can appear in an exported artifact.
6. Gap-finder: deterministic diff against the canonical-evidence checklist per domain (Waterlow/MUST/FRASE/SALT as first-class fields); one concrete suggested next document per gap, with a one-click drafted request letter.
7. Artifact #1: CHC Evidence Pack — cover summary + 12 domain sections (Nature/Intensity/Complexity/Unpredictability sub-paragraphs, cited) + appendix, exportable PDF.
8. Artifact #2: GP Appointment Brief — same Fact store, different `ArtifactTemplate` row, one page.
9. Supabase: `sources`/`claims`/`facts`/`conflicts`/`artifact_templates`/`artifacts`/`assertions`, RLS on every table, storage buckets private with signed URLs.
10. One live, unseeded document upload during the demo — the credibility moment.

**Kill list — explicit, not implicit:** eligibility predictor/scorer (never — regulatory rule, not a time tradeoff); full appeal-letter/case-law generator (roadmap slide); 28-day delay clock + Annex-E letter (cheap but cut — roadmap slide); DST-diff/audit-an-existing-assessment (needs OCR of a second complex form — stretch, skip); full PUPoC retrospective workflow (mention only); multi-tenant production auth/RLS hardening (single demo tenant is fine); ElevenLabs voice *output*, or any live mic capture (input only, pre-recorded); a third `ArtifactTemplate` (two already proves generality); devolved-nations copy or data (England/CHC-only); any payment flow; the Handover consent/telephony flow (deferred to the commercial roadmap, §10).

---

## 8. Demo script (3:00)

**Persona:** Margaret Ellis, 85, vascular dementia (2022) + Parkinson's (2019) + recurrent aspiration pneumonia (2x/12mo), self-funding at Elmfield Nursing Home for 8 months. Son David Ellis, next of kin, assembling evidence ahead of requesting a CHC Checklist.
**Documents:** (1) Care-home daily log — includes "settled overnight, no reported incidents" alongside a hoist-transfer entry and a PRN-lorazepam entry the same evening (the well-managed-need bait). (2) Hospital discharge summary — aspiration pneumonia, SALT swallow plan, strict-timing Parkinson's medication. (3) GP record summary — 3rd aspiration event in 12 months noted by the GP directly. (4) MAR chart — strict QDS Parkinson's medication + one PRN lorazepam entry matching the care log.

| Time | Beat |
|---|---|
| 0:00–0:15 | Hook: "If Margaret's needs are primarily health needs, the NHS pays fully. Otherwise her family pays roughly £50k a year out of pocket — and the difference comes down to whether anyone assembled the evidence correctly." |
| 0:15–0:40 | Live upload: discharge summary + GP record PDFs, dragged in on stage. Play the pre-recorded 15-second voice note from David describing a bad night. |
| 0:40–1:15 | Extraction reveal: 12-domain dashboard populates live, provenance colour-coded. Click into **Breathing → Priority** — cite two documented aspiration events across two sources. |
| 1:15–1:45 | The money beat: the care-log "settled overnight, no reported incidents" entry is flagged as evidence *for* the domain, not against it — para 162 quoted verbatim on screen. Say: "You can check that citation against the real government PDF right now." |
| 1:45–2:10 | Gap report: Continence flagged "thin — user-stated only." Click "Draft request letter to District Nurse." |
| 2:10–2:35 | Click "Generate CHC Evidence Pack" — PDF scrolls through domain sections with dated citations. |
| 2:35–2:55 | **The reveal.** Click "Generate GP Appointment Brief" from the identical record. A visibly different one-page artifact appears instantly. Say: *"Same evidence. Same engine. Different gatekeeper."* |
| 2:55–3:00 | Close: one line — CHC eligibility rate fell 31%→17%, incumbents charge £1,800–£4,000/case with zero AI-native competitors, roadmap items named but not shown. |

**Must be live:** the pipeline running on the newly uploaded document; domain-mapping and provenance appearing in real time; both artifact-generation clicks hitting real code paths (cache known-good responses by content hash as a silent fallback, never a visibly different code path). **Can be faked:** the historical 2 of 4 documents pre-seeded before the demo; the voice note pre-recorded and pre-transcribed, not live-captured.

---

## 9. Three-lane build plan (30h, freeze at 26h, contract-first)

| Hours | Lane A — pipeline | Lane B — UI | Lane C — fixtures / safety / deploy | Checkpoint |
|---|---|---|---|---|
| H0–2 | **All three together.** Lock TS/zod contracts: Source/Claim/Fact/12-domain enum/Provenance enum/ArtifactTemplate. Agree extraction API shape. | same | same, plus start drafting the 4 fixture documents immediately | Contracts typecheck against a hand-written fixture JSON |
| H2–4 | Supabase project (London/eu-west-2) + migrations + RLS shape; Next.js/Vercel scaffold | App shell renders from static fixture JSON, zero network | Finish + PDF/photo-ify the 4 fixture documents; write the sealed ground-truth answer key for §11's test | Repo boots end-to-end on fixtures only |
| H4–8 | Vision-extraction spike in isolation (no UI/DB); **run the 90-minute risk test from §11 here** | Upload UI + provenance-tagged claim table | Assemble the real/non-fixture documents for the §11 test; blind-score it | **GO/NO-GO gate.** If it fails, cut well-managed auto-flag to a manual toggle *now*, not at H28 |
| H8–14 | Claim→Fact reconciliation; domain-mapping call with well-managed-need pass folded in; substring kill-switch live | 12-domain dashboard with provenance mix + "suggested" badges + well-managed callout; citation viewer (`#page=N`) | Voice-note capture (record + pre-transcribe once); disclaimer copy wired into every screen | A live-uploaded document renders a fully cited dashboard |
| H14–19 | Gap-finder (deterministic); request-letter generator; ArtifactTemplate #1 (CHC pack) renderer | Gap panel + one-click letters; CHC Evidence Pack PDF view | Seed full persona dataset in Supabase; frictionless demo login; fixture-response recorder for a DEMO_MODE fallback | "Generate Evidence Pack" produces a real, cited PDF |
| H19–23 | ArtifactTemplate #2 (GP Brief) — new template row only, zero new pipeline code | "Generate GP Brief" reveal button + one-page view | Deck slides (market numbers, roadmap-not-built list); record the backup demo video | Both artifacts generate from the identical Fact store |
| H23–26 | Bug fixes only; prompt-cache pre-warm; fallback-to-cache on any slow call | Bug fixes only; test with venue wifi physically off | Full integration pass; rehearsal #1 | 🔒 **FREEZE at H26** — no new features, copy/fixture fixes only |
| H26–30 | Rehearse ×3 minimum, timed | same | same; finalise backup video + submission README | Demo runs twice back-to-back, under 3:10 each |

---

## 10. Commercial path

**Pricing model: flat fee or seat/volume licensing — never contingency.** Contingency pricing puts you in the same optics zone as an FCA-adjacent claims-management model and undercuts the "we don't act as your agent" positioning that keeps CHC and benefits outside regulated territory. Two tracks:
- **B2B into existing CHC advocacy/solicitor firms** (Beacon, Compass CHC, Hugh James, Farley Dwek, EMG Solicitors): per-case licence (e.g. £150–£300/case) or per-seat SaaS. The firm still bills the family £1,800–£4,000; this is pure margin expansion for them, not a threat to their fee — the easiest sell in this document.
- **B2B into the elder-care distribution channel** (employer benefits platforms — Zest, Lottie's Seniorcare; later-life insurers — L&G Care Concierge-style): pilot flat fee (£5–15k for 500–5,000 employees), scaling to per-member-per-month, with CHC/Attendance Allowance evidence-assembly as the premium tier inside a broader discharge/elder-care product.

**Who writes the first cheque:** a regional CHC advocacy or solicitor firm, on a paid pilot against live cases — single decision-maker, weeks not months, and they already spend the exact 10–20 caseworker-hours per case that the product compresses to 2–3. Run an SBRI Healthcare grant application (~£200k non-dilutive, discharge/readmission theme) in parallel — treat it as credibility and runway, not as a customer relationship.

**6-month plan:**
| Month | Milestone |
|---|---|
| 0–1 | 3–5 real families, free, recruited via Age UK / Carers UK / a CHC support community. Instrument two numbers: time from upload to evidence pack, and gaps found per family. |
| 1–2 | First paid pilot with one CHC advocacy/solicitor firm on live cases. Target: cut evidence-assembly time from 10–20 hours to 2–3. Get a number and a quote. |
| 2–4 | Add Attendance Allowance as the second `ArtifactTemplate` — fastest bolt-on (paper-only decision, same engine, no interview stage) — sold both to the same firms and directly to families. SBRI application submitted in parallel. |
| 3–6 | First employer-benefits-platform pilot (elder-care framing as the wedge), £5–15k, with CHC/AA as the "when it gets serious" premium feature inside it. |
| 6 | 2–3 paying advocacy-firm logos + 1 employer pilot + SBRI decision, positioned for an insurer conversation (L&G Care Concierge-shaped) at month 6–9. |

---

## 11. Biggest risk and the cheapest test this weekend

**Biggest risk:** not regulatory — that's well-mapped and mitigated by design. The risk is that the domain-mapping and well-managed-need engine works beautifully on four hand-authored fixture documents written specifically to contain the pattern being looked for, and fails to generalise to real, messy CHC-adjacent paperwork. The worst failure mode inside that risk isn't a missed flag — it's a **false** well-managed-need flag carrying a fabricated or misapplied paragraph citation, because that's the one output a CHC-literate judge (or a real family) can catch instantly, and it discredits the single strongest trust claim in the pitch: "you can check this against the real government document."

**Cheapest test — run at H6–8, before writing UI, not at H26:**
1. Assemble 8–10 documents nobody on the team wrote for the demo: public NHS/PRSB exemplar discharge summaries, realistic care-log entries written in the register CHC practitioner guidance describes (but not the exact fixture wording), one genuinely bad-quality photographed handwritten note from a teammate.
2. Plant, in a sealed ground-truth file two teammates don't see: 4–5 known domain-mapping answers, 2–3 genuine well-managed-need patterns, and 1–2 deliberate near-misses (stability language with *no* active intervention nearby — a true "no active need," to test the detector doesn't over-fire).
3. Run only extraction + domain-mapping + well-managed-need pass. No UI, no database.
4. Score blind: domain-mapping recall/precision, well-managed-need recall **and** precision, and spot-check every cited paragraph number against the actual Framework PDF.
5. **Pass bar:** domain-mapping recall ≥80% on the planted answers; well-managed-need **precision = 100%** (zero tolerance — a fabricated citation is worse than a missed flag) with recall ≥2 of 3; zero fabricated or misattributed paragraph citations across the run.
6. If it fails: don't discover this at hour 28. Fall back immediately to a manual "flag this as well-managed?" toggle the family clicks themselves — still demoable, still differentiated, zero fabrication risk.