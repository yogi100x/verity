# Data Sources — real documents and verified facts

**Two purposes.** The documents in §1 are for the blind eval — you must test on documents **nobody on the team wrote**, or you are scoring yourself on your own fixtures. The facts in §2 are verified against primary sources; do not paraphrase them.

All links checked 25 July 2026.

---

## 1. Test documents — for the blind eval (Lane D §7)

### 1a. PRSB eDischarge Summary example — the best single find

https://theprsb.org/wp-content/uploads/2024/06/Hospital-discharge-combined-scenario-and-example-discharge.pdf

Six pages. A complete, realistic worked discharge summary plus the clinical scenario behind it. **Robert Smith, 66**, retired electrician, past history of COPD; admitted 15 April 2016 with a three-day history of breathlessness, wheeze and productive cough; discharged 16 April.

Why it is ideal:

- **Nobody on your team wrote it**, so it is a genuine test rather than a rehearsal
- Structured exactly like a real discharge summary: admission method, discharge details, diagnoses with primary/secondary comments, clinical summary, medications with `Description of amendment: Added` and `Indication (for medication change)`
- **It contains a ready-made gap.** The scenario says: *"His GP was asked to review his BP a week after discharge."* No result follows. That is an `instruction_without_result` detection in a document you did not author — exactly the evidence the eval needs.
- It also has a **specialist nurse follow-up** ("will arrange to visit him in the next week") → `referral_without_outcome`
- Medication changes marked Added, with indications → material for reconciliation

**Use it as blind-eval document #1.** Plant nothing; the gaps are already there. Score whether Verity finds them.

### 1b. PRSB eDischarge Summary standard model

https://dzffzywis6qj0.cloudfront.net/prsb-assets/11-eDischarge%20Summary%20Standard/eDischarge-Summary-v2.1-1st-Feb-21.xlsx

The information model — 22 sections with conformance levels (mandatory / required / optional). Useful for two things: making your synthetic documents structurally correct, and choosing `ontology_key` names that map to a real NHS standard rather than inventions. If a judge asks why your keys look the way they do, "they follow the PRSB transfer-of-care model" is a good answer.

Full documentation: https://standards.nhs.uk/published-standards/transfer-of-care-acute-inpatient-discharge-standard

### 1c. CHC forms — blank official forms

| Document | Link |
|---|---|
| Checklist referral form | https://assets.publishing.service.gov.uk/media/632d86f3d3bf7f5680c6a8fc/NHS_Continuing_Healthcare_Needs_Checklist__accessible_form.pdf |
| Checklist guidance (36pp) | https://assets.publishing.service.gov.uk/media/632dd918d3bf7f567eeb5c4a/NHS-Continuing-Healthcare-Checklist-guidance-2022_accessible.pdf |
| Decision Support Tool (74pp accessible) | https://assets.publishing.service.gov.uk/media/63569f12d3bf7f0bd6f5176e/NHS-continuing-healthcare-decision-support-tool-guidance-2022-accessible.pdf |
| Fast Track Pathway Tool | https://www.gov.uk/government/publications/nhs-continuing-healthcare-fast-track-pathway-tool |
| **Consent form for sharing information** | https://www.gov.uk/government/publications/nhs-continuing-healthcare-consent-form-for-sharing-information |

**The consent form was updated 8 May 2026** — the most recent document in the collection. Worth reading against `prd.md` §8.4: if our four access bases align with the official form's wording, that is a strong slide. Lane C should check it.

### 1d. What to assemble for the eval

Target 8–10 documents, of which **at least 6 must be externally sourced**:

1. PRSB Robert Smith discharge summary (§1a)
2–3. Two more published NHS or trust exemplar letters — many trusts publish sample clinic letters
4–5. Two blank official forms above, partially completed by hand — tests form-shaped extraction
6–8. **Three phone photos taken in bad light at an angle.** Non-negotiable. Clean PDFs prove nothing about what families actually have.
9–10. A redacted real letter from a teammate's relative, if anyone will offer one

Seal the answer key **before** the scoring run. Score gap recall, gap **precision**, well-managed precision, and whether any framework citation was fabricated. Pass bar in Lane D §7.

---

## 2. Verified facts — checked against primary sources

### 2a. Well-managed needs — verbatim

National Framework, **paragraphs 162–166** (cross-referenced as that range at three separate points in the document, so the citation is safe):

> "The decision-making rationale should not marginalise a need just because it is successfully managed: well-managed needs are still needs."

And the diary provision, same section:

> "It may be necessary to ask the provider to complete a detailed diary over a suitable period of time to demonstrate the nature and frequency of the needs and interventions, and their effectiveness."

### 2b. Practice Guidance 23.2 — the strongest citation we have

DST Guidance 2022:

> "Where needs are being managed via medication (whether for behaviour or for physical health needs), it may be more appropriate to reflect this in the Drug Therapies and Medication domain."

This is the Framework instructing assessors to do **exactly what the demo does** with the furosemide conflict. Lead with it, not with para 162.

### 2c. Checklist thresholds — verbatim, para 19

A full assessment for NHS Continuing Healthcare is required if there are:

> • two or more domains selected in column A;
> • five or more domains selected in column B, or one selected in A and four in B; or
> • one domain selected in column A in one of the boxes marked with an asterisk

**Correction to `research/03`:** it phrased the fourth rule as *"an A in a Priority-capable domain plus any level elsewhere."* The real rule is about **asterisked boxes** and has no "plus any level elsewhere" condition. Use the wording above.

Also para 3: *"The Checklist threshold at this stage of the process has intentionally been set low."* Useful framing — a positive Checklist is a door, not a verdict, and our product should say so.

### 2d. Attendance Allowance — gov.uk

Lower rate **£76.70**, higher rate **£114.60** per week. https://www.gov.uk/attendance-allowance/what-youll-get

**Re-check the day before the demo.** A stale benefit rate quoted on stage is a caught error.

### 2e. CHC domain levels

Verified from the DST (pp.59–61) and encoded in `lib/contracts.ts` as `CHC_DOMAIN_LEVELS`. Three domains cap at High (continence, communication, psychological and emotional needs). Altered states of consciousness skips Severe entirely but reaches Priority. **Three ceilings were wrong before verification.** Do not edit that data.

---

## 3. Still unverified — do not put these on a slide unchecked

| Claim | Source | Status |
|---|---|---|
| "OpenAI shipped ChatGPT Health excluding UK/EEA" | `research/01` | **Unverified.** Load-bearing for a pitch line. Also note OpenAI's *API* does serve the UK and EEA with regional endpoints — do not conflate the consumer product with the API. |
| "Nature Medicine Feb 2026: 52% under-triage" | `research/01` | **Unverified.** Check the study exists and the number is right. |
| CHC eligibility rate 31% → 17% | `research/03`, marked secondary | **Unverified.** This is your "why now" number. Check against NHS England CHC quarterly statistics. |
| Beacon £1,400–£4,000 per case | `research/03` | Plausible, unverified. Their site blocked automated access. |
| 30-day readmission rates, delayed-discharge bed days | `research/02` | Directionally right, figures unchecked. NHS England publishes both monthly. |

My web search budget is exhausted, so these need you or a fresh session. **Twenty minutes on the top three is worth more than any remaining feature work** — the last verification pass found three factual errors in a document I had already written.
