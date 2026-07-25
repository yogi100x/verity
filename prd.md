# Verity, powered by Juno — PRD v2

**Product:** Verity (working title) — provenance-first medical record assembler, built as a companion layer to Juno
**Sponsor:** Juno (confirmed hackathon sponsor — integration is a first-class requirement, not a framing)
**Event:** Consumer Health Hackathon, 25–26 July 2026 · ~30h build
**Stack:** Next.js (App Router) · Supabase (London/eu-west-2) · Anthropic commercial API
**Supersedes:** `prd-v1-archive.md` (CarePath for Juno). Engine and safety thinking carried forward; persona, artifacts and demo changed per `research/01`–`research/04`.
**Build model:** solo orchestrator + AI agents on 3 machines, contract-first, spec/objective/test-driven.

---

## 1. The product in one sentence

**You dump a family's medical paperwork in; a clean document for an official reader comes out; every line in it traces back to the page it came from.**

Not a summariser. The differentiator is **provenance**: every assertion is either anchored to a verbatim quote at a known location in a source document, or is explicitly badged as unverified. There is no third state, and that is enforced in code and in the database — not by a prompt.

---

## 2. Why this and not a chatbot

Three things a general-purpose assistant does not do:

1. **It reasons about disagreement.** Three documents saying different things about one medicine is a first-class object, not noise to be smoothed over.
2. **It reasons about absence.** "Your discharge letter asks for a renal check within 7 days and there is no result after that date" is a statement about the *record*, computed by date arithmetic, not a guess.
3. **It produces an artefact for a named gatekeeper**, and the same evidence produces a different artefact for a different gatekeeper without re-reading anything.

---

## 3. Demo — the north star

Everything in this document exists to make these three minutes work. When a scope question arises, the answer is whatever protects this.

| Time | Beat |
|---|---|
| 0:00–0:20 | Margaret Ellis, 82, discharged from hospital last month. Her daughter Sarah lives 200 miles away and has a carrier bag of paperwork. |
| 0:20–0:40 | **Live upload.** Sarah drops in the discharge summary, a phone photo of the repeat prescription, and an older cardiology letter. Extraction runs on screen. |
| 0:40–1:20 | **THE MONEY MOMENT — conflict card.** Three sources disagree about furosemide. Discharge summary p2 line 14: *stopped*. Repeat prescription printed 8 days later: *still listed*. **Margaret's own Juno entry, 3 July:** *"still taking my water tablet at bedtime like always."* Three chips, all clickable to source. Below: a question nobody typed — *"Three sources disagree about the water tablet. Ask whether it should have been restarted."* **The line to say out loud:** *"Two of those are institutions. One is Margaret. Nobody had ever put them in the same room."* |
| 1:20–2:00 | Timeline + gap panel. Every event carries a citation chip or an orange unverified badge. Gaps include *"discharge summary asks for renal function review within 7 days; no result recorded after that date."* |
| 2:00–2:35 | **Generate CHC Evidence Pack.** The furosemide disagreement lands in *Drug therapies and medication* — one of the domains that can reach the Priority level. Quote **Practice Guidance 23.2** verbatim: *"Where needs are being managed via medication... it may be more appropriate to reflect this in the Drug Therapies and Medication domain."* Then para 162: *"well-managed needs are still needs."* Line: **"That isn't our interpretation — that's the Framework telling assessors to do exactly this. Check it against the government PDF right now."** Then the stake: NHS pays 100%, or this family pays ~£60k a year. |
| 2:35–2:50 | **Generate GP Appointment Brief** from the identical record. Visibly different one-page artefact, instantly. *"Same evidence. Same engine. Different gatekeeper."* |
| 2:50–3:00 | Close on the roadmap: discharge pack, benefits, self-serve for patients — all template rows over the same claim table. |

**Live vs replay.** Primary path: the first upload genuinely runs. Everything downstream renders from fixtures keyed by content hash — identical code path, so a network failure is invisible. A full `replay` mode requiring no network at all is built and rehearsed as backup, plus a recorded video.

---

## 4. Personas

**Sarah Ellis, 54** — the operator. Marketing manager in Manchester, two teenagers, the "default sibling." Uploads, reviews, prints, attends. Every screen is designed for her.

**Margaret Ellis, 82** — the subject. Bristol, widowed, lives alone. Admitted 21 June 2026 with breathlessness and ankle swelling, discharged 25 June. Heart failure (HFrEF), CKD stage 3b, type 2 diabetes. She is not required to use the app.

**Maya, 34** (phase 3) — chronic illness, self-serve. Modelled as the degenerate case of the carer relationship: a `care_relationships` row where member and subject are the same person. No engine fork.

---

## 4b. Juno integration — first-class, not a wrapper

**Juno** (junocompanion.com) is *"your 24/7 AI health assistant for chronic illness"* — symptom tracking, pattern identification, and doctor report preparation, built on founder research at Oxford and UCL across 1,000+ patient interviews. No public API at time of writing.

Juno holds the patient's **longitudinal lived experience**: what they said, how they felt, tracked conversationally over time. Verity holds the **institutional record**: discharge letters, prescriptions, clinic letters, care logs.

Those two halves never meet in real healthcare. The patient's account lives in their head or in an app; the institution's account lives in a filing system; no one reconciles them. That reconciliation is the product.

**Architecturally Juno is a `SourceKind`, not a special case.** A Juno conversation becomes a `Source`; its sentences become `Claim`s with `provenance: 'user_stated'`; they flow through the identical pipeline, group into the same `Fact`s, and can participate in the same `Conflict`s. One enum value, no branching logic.

```ts
SourceKind = 'pdf' | 'image' | 'audio' | 'text' | 'juno_conversation'
```

**Why this makes the demo stronger.** The hero conflict is not two PDFs disagreeing — it is **an institution and a patient disagreeing**, with the patient's own words as a first-class citation. No competitor can show that, because no competitor holds both halves.

**Division of labour, unchanged from v1:**

| | Juno | Verity |
|---|---|---|
| Conversational support | Primary | No |
| Symptom tracking over time | Primary | Consumes it |
| Longitudinal lived experience | Primary | Consumes it |
| Institutional documents | No | Primary |
| Provenance + reconciliation | No | Primary |
| Artefacts for gatekeepers | No | Primary |

### Handling the overlap — read this before pitching

Juno ships **doctor report preparation**. Our GP brief resembles it and must never be pitched as a better version. `prd-v1-archive.md` flagged this as Risk 4; sponsor status makes it sharper.

**The boundary is the situation, not the patient.** Margaret has heart failure, CKD and type 2 diabetes — she is squarely Juno's cohort, and the integration depends on that being true. What sits outside Juno's scope is not *who* she is but *what is happening to her*.

Juno is the companion for **living with the condition**: day to day, symptoms tracked, patterns surfaced, a report prepared for a routine appointment.

Verity is the tool for the **events** — a hospital discharge, a funding assessment, a benefits claim — where a pile of paperwork suddenly determines an outcome and Juno's input does not reach, because Juno never sees the paperwork.

| | Juno | Verity |
|---|---|---|
| Moment | Ongoing management | Discrete high-stakes events |
| Input | Self-reported symptoms, tracked conversationally | Institutional documents, photos, voice |
| Strength | Her account, longitudinally, in her words | Provenance — every line cited to a page |
| Cannot do | Cite a document it has never seen | Know how she felt on a Tuesday in March |
| Reader | The GP | ICB funding panel, GP, DWP, local authority |

**Never say** "our brief is better than Juno's." **Say:** *"Juno is the companion for living with the condition. We handle the events — discharge, assessments, funding — where the paperwork decides the outcome. Juno never sees that paperwork. And the interesting bit is what happens when her account and the record disagree."*

The **headline artefact does not overlap at all**: the CHC evidence pack is entirely outside Juno's scope. The GP brief is deliberately the *closing* reveal rather than the hero — it exists to prove the one-engine-many-gatekeepers claim, not to compete with a sponsor's shipped feature.

**Positioning line:** *Juno remembers what she told you. Verity reconciles it with what the record says.*

**Phase 1 implementation:** synthetic seeded Juno dataset (as v1 planned — `prd-v1-archive.md` §28). If a live Juno API is available at the event, the integration point is a single ingest adapter producing `Source` rows; nothing downstream changes.

---

## 4c. Channels — how information gets in

**Delivery: a responsive PWA — an app-shaped experience on the web.** Installable to the home screen, standalone display with no browser chrome, mobile-app layout patterns, and an offline shell. Not native: a URL opens instantly on a judge's phone and on the venue laptop, needs no store or provisioning, gives every PR a clickable preview (which is how this build is reviewed at all), and `window.print()` produces the printable brief that is the product's killer artefact. The offline shell also makes the stage-failure story architectural rather than a trick.

Margaret is 82, lives alone, and may not see well. **The design answer is that she never uses an interface.** Sarah operates the app; Margaret contributes by speaking. That is stronger than any accessibility feature.

| Channel | Status | Rationale |
|---|---|---|
| Web app (Sarah) | **Ships phase 1** | She is the operator. All screens target her. |
| Juno entries | **Ships phase 1** | Seeded synthetic dataset; sponsor integration; third conflict chip. |
| Browser mic capture | **Ships phase 1** | ~1h, zero provisioning, works offline in replay mode. |
| Inbound phone number (Twilio) | **Lane E** | US number already held. Real PSTN call → `<Record>` → `Source`. No provisioning risk — only the webhook remains. |
| WhatsApp | **Post-hackathon** | Blocked on Meta business verification of the WABA. Not a vendor choice — Zernio's own prerequisites confirm it. No sandbox documented. |
| Conversational voice agent | **Cut, permanently** | An agent that questions an elderly person about symptoms is interactive clinical information gathering — the exact line §8 exists to stay behind. One-way capture of a volunteered statement is a document; a back-and-forth is an interview. |
| Outbound calling | **Cut** | Consent optics, and cut twice already in `research/03` and `research/04`. |
| Voice output / read-aloud | **Cut** | Earns nothing on the rubric, fails in noisy rooms, and synthesised speech saying anything route-shaped drifts toward device territory. |

**Note for Lane A regardless of channel:** inbound images are commonly capped around 5MB by messaging providers, and phone photos of prescriptions routinely exceed that. Downscale client-side before upload — wanted anyway for extraction cost.

---

## 5. The engine

### 5.1 Domain model

```
Source  →  Claim  →  Fact  →  (Conflict)  →  Artifact
```

- **Source** — anything that came in. PDF, phone photo, voice note, typed text. One table, one `kind` enum.
- **Claim** — one atomic assertion plus the verbatim words it came from and where they were. Cheap, disposable, can be wrong. **Dropped if its quote is not a literal substring of its source.**
- **Fact** — the reconciled unit. Only Facts may be cited by an Artifact. Produced by deterministic grouping of Claims.
- **Conflict** — two live Claims about the same subject with incompatible values. Never silently resolved; always surfaced.
- **Artifact** — a rendering of Facts through an `ArtifactTemplate`.

**The ordering is load-bearing.** Claim before Fact is what makes "no assertion without a citation" a structural property instead of a prompt-engineering hope.

### 5.2 Reductions over the claim set

Everything downstream is a reduction, not a separate pipeline:

| Output | Reduction |
|---|---|
| Timeline | Facts ordered by `asserted_at`, deduplicated |
| Conflicts | Two live Claims, same `ontology_key`, incompatible values |
| Gaps | Deterministic detectors over Facts (see §7.3) |
| Current state | Last-write-wins per `ontology_key`, conflicts flagged |
| Any artefact | Filtered projection through a template |

### 5.3 ArtifactTemplate is data, not code

A template is a row: sections, each with slots; each slot declares which `ontology_key`s fill it, whether a citation is required, and a `gap_prompt` shown when it cannot be filled. **Adding a fifth gatekeeper is seed data, not a new code path.** This is the claim the pitch rests on, and it must be architecturally true.

Phase 1 ships two templates: `chc_dst_pack_v1` and `gp_brief_v1`.

---

## 6. The contract

**Abridged sketch — `lib/contracts.ts` is authoritative and already committed.** Where this section and that file disagree, the file wins. Changing it requires the orchestrator, never an agent acting alone.

```ts
// lib/contracts.ts

export type Provenance =
  | 'user_stated'
  | 'document_extracted'
  | 'system_inferred'
  | 'unknown';

export type SourceKind = 'pdf' | 'image' | 'audio' | 'text' | 'juno_conversation';

export type DatePrecision = 'exact' | 'month' | 'year' | 'approximate' | 'unknown';

export interface Source {
  id: string;
  person_id: string;
  kind: SourceKind;
  title: string;               // "Discharge summary, 25 Jun 2026"
  storage_path: string;
  transcript: string;          // model's verbatim read of the source
  transcript_confidence: number;
  author_member_id: string | null;
  created_at: string;
}

export interface Locator {
  page: number | null;         // PDFs / images
  char_start: number | null;   // offset into transcript
  char_end: number | null;
  ms_start: number | null;     // audio
  ms_end: number | null;
}

export interface Claim {
  id: string;
  source_id: string;
  ontology_key: string;        // 'medication.furosemide' | 'chc.drug_therapies' | ...
  subject: string;             // normalised: "furosemide"
  value: string;               // "40mg once daily, stopped"
  quote: string;               // VERBATIM from source
  locator: Locator;
  asserted_at: string | null;
  date_precision: DatePrecision;
  provenance: Provenance;
  verified_substring: boolean; // false ⇒ dropped, never surfaced
}

export interface Fact {
  id: string;
  person_id: string;
  ontology_key: string;
  subject: string;
  canonical_value: string;
  provenance: Provenance;
  status: 'confirmed' | 'disputed' | 'unknown';
  valid_from: string | null;
  valid_to: string | null;
  supporting_claim_ids: string[];   // empty ONLY when status==='unknown'
  conflict_id: string | null;
}

export interface Conflict {
  id: string;
  person_id: string;
  ontology_key: string;
  subject: string;
  claim_ids: string[];              // >= 2
  generated_question: string;       // "Ask whether it should have been restarted."
  resolution: 'unresolved' | 'user_resolved';
}

export interface Gap {
  id: string;
  person_id: string;
  detector: string;                 // 'instruction_without_result' | ...
  statement: string;                // statement about the RECORD, never advice
  supporting_claim_ids: string[];
  suggested_next_document: string | null;
}

export interface Slot {
  key: string;
  label: string;
  ontology_match: string[];
  citation_required: boolean;
  renderer: 'prose' | 'list' | 'table' | 'conflict' | 'quote';
  gap_prompt: string | null;        // shown when unfillable — NEVER fabricated prose
}

export interface ArtifactTemplate {
  key: 'chc_dst_pack_v1' | 'gp_brief_v1' | 'discharge_pack_v1' | 'aa1_narrative_v1';
  title: string;
  audience: string;
  sections: { key: string; title: string; slots: Slot[] }[];
}
```

**Forbidden across the entire schema.** There is no `severity`, `rank`, `urgency`, `priority`, `risk`, or `score` field anywhere, at any level. The model cannot express a clinical judgement because there is nowhere to put one. This is the primary regulatory control and it is structural. See §8.

---

## 7. AI pipeline

### 7.1 Models

| Step | Model | Effort | Notes |
|---|---|---|---|
| Red-flag scan | none — regex | — | Runs before any model call |
| Extraction (per source, parallel) | `claude-sonnet-5` | `low` | Native PDF/image blocks, forced strict tool use |
| Grouping assist (unmatched only) | `claude-sonnet-5` | `low` | One batched call |
| Gap + well-managed pass | `claude-sonnet-5` | `medium` | One batched call over Facts |
| Relative-date resolution | `claude-haiku-4-5` | n/a | Batched; note Haiku uses `budget_tokens`, not `effort` |
| Artefact generation | `claude-sonnet-5` | `medium` | `claude-opus-5` as optional hand-triggered upgrade for prose only |

Target: ~7–10s upload→populated dashboard, first content ~2s, ~$0.15–0.25 per 4-document case.

**Never combine the citations API with `output_config.format`** — returns 400. Extraction is forced strict tool use plus our own substring check. Confirmed against Anthropic docs.

### 7.2 Substring kill switch

After every extraction call, for every Claim:

```
normalise(source.transcript).includes(normalise(claim.quote))
```

False ⇒ `verified_substring = false` ⇒ **dropped**. Not flagged, not retried, not shown. Normalisation handles whitespace runs, smart quotes, ligatures, and hyphenation across line breaks — and nothing else.

This produces a demoable number: *"312 claims extracted, 4 dropped for unverifiable quotes."*

### 7.3 Gap detectors — code, not model

These run as pure TypeScript over the Fact set. Being deterministic is the point: when a judge asks "how do you know it isn't making that up", the answer is "that one is date arithmetic."

1. `instruction_without_result` — a Fact instructing an action within N days, with no later Fact of the expected type
2. `referral_without_outcome` — referral recorded, nothing after it
3. `review_date_passed` — "review in 6 months", date passed, nothing recorded
4. `referenced_document_absent` — a source references a document not among the sources
5. `medication_without_review` — medication Fact with no review date

### 7.4 Well-managed-need detector (CHC)

Stability language (`settled`, `no incidents`, `stable on`, `no concerns`) co-occurring in the same source with active-intervention evidence (PRN medication, hoist transfer, prompted care, 2-hourly checks) ⇒ flag, and quote National Framework para 162 verbatim.

**The model may only select a pre-written citation id. It may never generate a paragraph number.** Fabricating a citation is the one failure that destroys the product's credibility, so it is made structurally impossible rather than discouraged.

---

## 8. Safety layer

### 8.1 The line

State facts about documents. Never compute a clinical judgement.

| Allowed | Forbidden |
|---|---|
| "Three sources disagree about furosemide." | "These two medicines interact." |
| "The discharge summary (25 Jun, p2 l14) says it was stopped." | "This dose is too high." |
| "The record shows no follow-up after the March review." | "This is the most concerning gap." |
| "This is a question for the pharmacist or GP." | Any severity, urgency or risk label. |

Rationale: UK MHRA treats software that assesses seriousness or performs triage as a medical device — NHS 111 online explicitly does not diagnose and is still a registered Class I device. Drug-interaction and dose-checking software is a device with no ambiguity. We stay outside by never producing those outputs.

### 8.2 Three enforcement layers

1. **Schema** — no severity/rank/urgency/priority field exists (§6).
2. **Substring kill switch** — no uncited assertion can reach an artefact (§7.2).
3. **Output filter** — regex over every generated string, rejecting `triage`, `urgent`, `emergency`, `diagnosis`, `interact`, `you should`, `likely`, `suggests`, `consistent with`, `probably`, plus any condition name not present verbatim in a cited source span. On trigger: store nothing, render the refusal card.

A prompt instruction is not a control. All three are code.

### 8.3 Deterministic red flags

`lib/safety/red_flags.ts` — pure TypeScript, unit-tested, runs on the concern/free-text fields **before any model call**. Never over uploaded document text (a letter mentioning historical chest pain would fire on every run).

On hit the pipeline **halts** — no model call is made — and renders a fixed card. Fourteen rules, taken from `research/01` §6: cardiac chest pain, stroke/FAST, airway, anaphylaxis, sepsis, uncontrolled bleeding, collapse/seizure/head injury, thunderclap headache, cauda equina, acute limb/testicular ischaemia, self-harm intent, obstetric, metabolic, acute eye.

Negation and tense guard within 5 tokens: `no`, `not`, `denies`, `never`, `without`, `used to`, `previously`, `history of`, `resolved`.

### 8.4 Consent and capacity

- Never assess capacity. The app records an **asserted legal basis**; it never evaluates one.
- Four bases only: `person_consent` | `lpa_health_welfare` | `court_deputy` | `best_interests_declared`.
- Carer declaration is a typed full name, not a checkbox.
- Persistent access-basis badge on the carer dashboard.
- Revocation empties the carer's view immediately, enforced by RLS, not UI.

Phase 1 ships the typed declaration and the badge. Outbound telephony consent is **cut** — it answers "who may see this", which is not what this weekend needs to prove.

### 8.5 Disclaimer copy (ship verbatim)

**Persistent banner:**
> This tool organises evidence you already have. It does not assess symptoms, diagnose, or tell you how urgent something is. If you need to know how urgent something is, use NHS 111 online. If someone's life is at risk, call 999.

**Artefact footer:**
> Assembled by [Name] using Verity on [date] from documents they supplied and reviewed. This is not a clinical record, not a clinical summary, and has not been reviewed by a clinician. Every dated item links to the page it came from.

Never title an artefact "clinical summary", "handover note", "referral" or "SBAR".

### 8.6 Safeguarding — passive only

Never auto-escalate, never claim to detect abuse. A persistent footer signposts adult social care and 999. We are a document tool, not a safeguarding authority.

---

## 9. Data model (Supabase, London / eu-west-2)

```
people                 (id, display_name, dob, created_by)
care_relationships     (person_id, member_id, role, access_basis, granted_at, revoked_at)
sources                (per §6)
claims                 (per §6)
facts                  (per §6)
claim_conflicts        (per §6)
gaps                   (per §6)
artifact_templates     (key, title, audience, sections jsonb)
artifacts              (id, person_id, template_key, user_verified, created_at)
assertions             (id, artifact_id, slot_key, text, fact_ids[], citation_verified)
consent_records        (id, person_id, member_id, basis, declared_name, accepted_at)
```

**One RLS policy covers both markets** — self-serve is the degenerate carer case:

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

**Database-level citation integrity:** an `assertions` row cannot be marked `citation_verified = true` without a non-empty join to supporting facts. Enforced by constraint, not convention.

**Auth:** `signInAnonymously()`. Gives a real `auth.uid()`, so RLS is written once and there is no service-role escape hatch in the request path. Fifteen minutes, not four hours. Enable the toggle in hour 0.

---

## 10. Design system

From `research/04` §3. Non-negotiable because consistency is what makes it look finished.

**Type.** Fraunces (display — masthead, landing headline, conflict-card header only). Public Sans (UI/body; chosen over Inter because USWDS tested it for low-vision and older-adult legibility). IBM Plex Mono (every verbatim quote and locator). **The mono switch is itself the provenance signal**: Plex Mono means copied from a source; Public Sans means prose the product wrote.

**Colour.** Paper `#FAF7F2` · ink `#1C1B1A` / `#55504A` · hairline `#E7E1D8` · brand deep forest-teal `#14453D` · citation chip `#E4EFEC`/`#A9C9C2`/`#14453D` · unverified terracotta `#FBEADD`/`#E8B98C`/`#9A4A15` · conflict amber `#FFF4D6`/`#E0B94A`/`#7A5C05` · emergency `#B3261E` on `#FDEDEC`, **reserved exclusively** for the 999 card — never for validation or error states.

**Scale.** Root 18px (not 16). Spacing `0.25 0.5 0.75 1 1.5 2 3 4 6` rem. Radius 4px chips / 12px cards / 20px primary CTA. Motion 120ms micro, 320ms timeline entry with 60ms stagger, all wrapped in `prefers-reduced-motion`.

**`<ProvenanceTag>`** — the signature component. Type-level invariant: requires either a `citation` prop or `userStated: true`. A sourceless fact is **unrepresentable**. Citation variant shows document short-name plus Plex Mono locator, hover reveals the verbatim quote, click opens the source at `#page=N` via a 60-second signed URL. Unverified variant reads *"You told us this — not from a document."*

### Design discipline — borrowed from CRED, inverted in mood

CRED's design language is the reference for **restraint**, not for atmosphere. Take the discipline; reject the register.

**Take:**
- **One idea per screen.** If a screen is doing two things, it is two screens. Density is the enemy of a frightened reader.
- **Aggressive type hierarchy.** Large confident display against quiet body copy — aim for a 3–4× size ratio between a screen's headline and its body, not the timid 1.5× that most apps settle for.
- **Whitespace as a statement.** Section gaps of 3–6rem, not 1.5. Emptiness signals confidence; crowding signals panic.
- **Copy that is punchy and short.** A sentence where others write a paragraph. No explanatory preambles.
- **Motion as craft.** Every transition deliberate and consistent. The 400ms beat of silence before the conflict question resolves is the single best example — that pause is designed, not incidental.

**Reject, deliberately:**
- **Dark theme.** Wrong for an 82-year-old's eyes in daylight, breaks visual parity with the printed artefact, and reads cold when someone is frightened. Warm paper is the correct inversion — same restraint, opposite temperature.
- **Exclusivity and aspiration.** CRED sells status. Verity sells *"you can stop panicking — here is what your documents actually say."* The register is calm, steady, unhurried. Never premium, never clever.

The test: a screenshot should look like it was designed by someone with taste and *nothing to prove*.

**Accessibility.** WCAG AA minimum, AAA on primary pairs. 44px touch targets (48 default, 56 primary). Holds at 200% zoom. Never colour alone — every status carries at least two of {icon, text, border-style}.

---

## 11. Phasing

**Phase 1 — this weekend.** Engine (Source→Claim→Fact→Conflict), substring kill switch, deterministic gap detectors, red-flag layer, output filter, timeline, conflict card, CHC evidence pack, GP appointment brief, printable output, consent declaration, seeded Margaret dataset, live upload path plus fixtures plus replay mode.

**Phase 2 — discharge pack.** `discharge_pack_v1` template row: what happened, reconciled medication picture, watchlist, chase list with owners. New seed data and one renderer. No engine change.

**Phase 3 — self-serve (Maya).** A `care_relationships` row where `member_id = person_id`, `role = 'self'`, plus first-person copy. No consent screen. No engine change. If time permits in phase 1, it is a 25-second demo coda at zero build cost.

**Phase 4 — benefits.** `aa1_narrative_v1` (Attendance Allowance). Paper-form decision with no interview, so the written evidence *is* the whole decision — the strongest post-hackathon fit. Deterministic rules pass over the same Fact store.

---

## 12. Non-goals

No diagnosis. No triage or urgency assessment. No drug-interaction or dose checking. No severity or risk scoring. No falls/frailty scores. No capacity assessment. No automated safeguarding referral. No booking. No NHS system integration. No eligibility prediction — the product never states or implies a CHC outcome. No real patient data at any point; synthetic personas only.

---

## 13. Phase 1 acceptance criteria

The build is done when, from a cold start and with no database fiddling:

1. A document uploads and produces Claims with working citation chips
2. Every claim whose quote fails the substring check is absent from the UI, and the drop count is displayed
3. Three sources disagreeing about one medication produce a conflict card with three clickable chips, one playing audio
4. The conflict produces a generated question that appears in both artefacts
5. At least three gaps appear, at least two from deterministic detectors, zero fabricated
6. Typing chest-pain text halts the pipeline in under 3 seconds with **no model call made**
7. "Generate CHC Evidence Pack" produces a domain-organised, cited, printable document
8. "Generate GP Brief" produces a visibly different one-page artefact from the identical Fact store
9. The full path completes in under 4 minutes with the network physically off, in `replay` mode
10. Every UI string passes the output filter — no condition names, no urgency language
