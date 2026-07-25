# Recovered Work — Supplement to 01/02/03

*Five design agents died mid-run across two earlier research workflows. Their surviving output — one full pipeline spec, one full visual/interaction spec, one complete elder-care concept spec, and two dead stubs (MedRec, Owed — scores and reuse% only, no content survived the crash) — is folded in here. This document does not restate market sizing, regulatory analysis, or hour-by-hour plans already settled in `research/01-carepath-market-and-build.md`, `research/02-eldercare-opportunity.md`, `research/03-chc-entitlements.md`. Read those first. This is the delta.*

---

## 1. What changed

**Confirmed and sharpened:**

- **The Claim→Fact→(Conflict)→Artifact engine, generalized.** 02 and 03 had already converged on this independently. The recovered pipeline lens is the concrete implementation of it — exact tool schemas, exact algorithms, exact call graph, exact wall-clock (~7–10s upload→populated dashboard, first content ~2s) and cost (~$0.15–0.25 per 4-doc case). This retires the last reason to treat 01's simpler `facts`/`timeline_events`/`gaps` schema as sufficient on its own: the shared engine needs `claims` and `claim_conflicts` under `facts` in **every** build, including the chronic-illness-only CarePath build in 01, not just Handover/CHC.
- **No citation-API extraction, anywhere, ever.** 01 designed Pass A around `citations:{enabled:true}` with a footnote that it's incompatible with `output_config.format`. 02 and 03 had already abandoned the citations API in favour of forced strict tool-use plus a code-side substring kill-switch. The recovered pipeline lens settles this 3–1: one extraction call per Source does both jobs (self-report `transcript` + `claims[]`), and a deterministic substring check — not the API — is the only citation guarantee. **Overturned: 01 §5 Pass A must be rewritten** to drop `citations:{enabled:true}` entirely (spec in §2 below).
- **Model choice: Sonnet 5 is the workhorse, not Opus 5.** Both 01 (subtitle: "Claude Opus 5 + Supabase + Next.js") and 02 ("`claude-opus-5` commercial API throughout per the settled stack") assumed Opus 5 for everything. The recovered pipeline lens argues this specifically and numerically: Opus 5 is ~1.7x the cost with no meaningfully different latency or quality on hand-authored, readable fixture documents, and the only place quality plausibly matters is artefact prose, not extraction. **This wins** — it's a reasoned cost/latency argument against an unexamined default, not a competing guess. Sonnet 5 (adaptive thinking, effort tuned per step) is now the default across every step; Haiku 4.5 is used once, for the batched relative-date-resolution call; Opus 5 is retained only as an optional hand-triggered upgrade for final artefact prose, never for extraction, grouping, gap-detection, or date resolution. **Amend 01's subtitle and 02 §4's "model choice" line.**
- **Handover's telephony consent handshake is out — for real this time.** 03 already recommended not building it this weekend ("wrong bet to prove 'does the extraction engine work'"). 02's own hour-by-hour plan (H14–18: outbound ElevenLabs call, keypad consent, SMS fallback; H18–21: live voice capture) still allocated real hours to it. The recovered Handover concept — written independently, working from the same brief — reaches the identical conclusion and says so explicitly: *"Do not build the telephony consent handshake this weekend... this task's framing... confirms it."* That's two independent analyses against 02's plan on the same point. **02's H14–21 telephony/live-voice line items are overturned.** Ship a typed, non-checkbox acting-for declaration instead (copy given in §2 of 02, reused verbatim in the recovered concept). A single pre-seeded voice note is fine for the demo beat; live capture and outbound calling are not built.
- **02's own scoring table is partially wrong, and 03 already said so.** In 02's table, only the winning concept ("Handover — discharge cut," 8.5) had a written spec behind its score; the rest — including "CHC 12-domain evidence mapper" at 5.5, marked "completely undemoable in 36 hours" — were scored without surviving detail (the same failure mode this document is patching). 03 built CHC out in full and shipped a concrete 30-hour, 3-lane plan with a GO/NO-GO gate at H8. The recovered pipeline and visual lenses now show the CHC build's hardest piece — the well-managed-need detector with a verbatim-citation lookup table — is a bounded, deterministic-adjacent, demoable feature (§2, MODEL-NEEDED detector (a)). **02's CHC score of 5.5 does not survive; retract it.** See §4 for the reconciled ranking.
- **02's own headline concept, once actually specced, scores lower than 02 claimed.** The recovered "Handover — Discharge Cut (single-writer)" concept — the closest thing that exists to a built-out version of 02's 8.5 pick — self-scores **7.5**, explicitly matching 02's own fallback ("72-Hour Discharge Pack," also 7.5) once telephony, live consent, and the second contributor are cut. This is not a contradiction to paper over: 02's 8.5 score was for a fuller spec than anyone is actually going to build this weekend. Use 7.5 as the honest number for Handover in any weekend build. This directly reinforces 03's independent ranking (CHC 1st, discharge 2nd) rather than 02's internal ranking (discharge 1st, CHC unrated-low).
- **AA rate cross-verified.** 02 flagged "verify £114.60 vs the stale £110.40 figure before the pitch." 03 independently sourced the same £114.60/week (FY2026/27) figure. Confirmed, no action needed beyond noting the cross-check.
- **Design system is entirely new, not contradictory.** None of 01/02/03 specified typefaces, hex values, or a spacing scale — only prose descriptions ("teal citation chip," "orange unverified badge," never colour alone). The recovered visual lens gives exact tokens that are consistent with every prose description already in 01 and 02 (teal→`#14453D`, orange/terracotta→`#9A4A15` on `#FBEADD`, red reserved for the 999 halt card only). Nothing to resolve here — see §3 — except that **prd.md and all three research docs currently have zero design-system content and need it added** (§6).
- **MedRec and Owed did not survive.** Their entries carry only a name, a score, and a reuse percentage — the body content is the literal placeholder string `"test"`. Do not treat 6.5/10 and 7/10 as evidence of anything. Their *scope* is not lost, though: MedRec's job (medication conflict detection) is already a first-class feature of the shared engine's `claim_conflicts` table and needs no separate concept; Owed's job (entitlement/benefits navigation) is already captured as the one Attendance-Allowance line 02 added back into Handover, and 03 independently ranks the broader benefits wedge #3, below CHC and discharge. Neither needs to exist as a standalone weekend concept. Treat their scores as void.

**Contradicted, and which side wins — summary table:**

| Question | 01 said | 02 said | 03 said | Recovered work says | Winner |
|---|---|---|---|---|---|
| Model for extraction | Opus 5 | Opus 5 | (silent) | Sonnet 5 default, Opus 5 upgrade path for prose only | **Recovered** — reasoned, numeric |
| Citations API for Pass A | Use it (with a caveat) | Don't use it | Don't use it | Don't use it, anywhere, ever | **02/03 + recovered**, 01 amended |
| Build Handover's telephony consent | (n/a) | Build it, H14–21 | Don't build it | Don't build it | **03 + recovered**, 02 amended |
| CHC demoability in a weekend | (n/a) | "Completely undemoable," 5.5/10 | Fully specced, buildable, GO/NO-GO gated | Confirms the hardest CHC feature is a bounded, deterministic-adjacent detector | **03 + recovered**, 02's score retracted |
| Handover discharge-cut score | (n/a) | 8.5 (full spec, unbuilt) | Ranked #2 behind CHC | Actual spec ships at 7.5 once realistically scoped | **03's ranking confirmed**; 02's number was for a bigger build than anyone will ship |

---

## 2. The AI pipeline, specified

This is the single engine every artefact (CarePath gap panel, Handover discharge pack, CHC evidence pack, GP brief, AA1 narrative) is generated from. `ArtifactTemplate` rows differ; the pipeline below does not.

### 2.1 Model per step (4-document case, cost/latency)

| Step | Model | Config | Cost/latency |
|---|---|---|---|
| 0. Red-flag regex on concern text | code only | — | 0 cost, <10ms, halts pipeline if triggered |
| 1. Pass A: per-Source extraction+transcript, parallel | `claude-sonnet-5` | `thinking:{type:'adaptive'}`, `effort:'low'`, strict tool call | ~$0.02–0.03/doc, 4 docs in parallel ≈ 2–4s wall, ≈$0.09 total |
| 2. Grouping-candidate assist (unmatched subjects only) | `claude-sonnet-5` | `effort:'low'`, one batched call | ~1–2s, ~$0.01 |
| 3. Well-managed/narrative-gap pass | `claude-sonnet-5` | `effort:'medium'`, one batched call over all facts | ~2–3s, ~$0.012 |
| 4. Relative-date resolution | `claude-haiku-4-5` | `effort:'low'`, one batched call for all unparseable dates in the case | ~1s, ~$0.002 |
| 5. Artefact generation (per artefact) | `claude-sonnet-5` (opus-5 optional upgrade) | `output_config.format=json_schema`, streamed | ~3s–6s, ~$0.027/artefact |

Never upgrade steps 1/2/4 to Opus 5. The only sanctioned upgrade path is step 5, and only when demo/judge prose quality outweighs ~5x the cost.

### 2.2 Ingestion

No OCR pipeline. PDFs and images go to Claude as native document/image content blocks (base64, Files API for reuse across calls). **One extraction call per Source does both jobs**: emit a best-effort verbatim `transcript` (used only to verify quotes are real substrings — never summarised or corrected) and `claims[]` with quotes asserted to be substrings of that transcript.

Client-side pre-upload: EXIF auto-rotate only — never crop or deskew (cropping risks clipping the exact text you need to cite). If claim count is near-zero or substring-verification failure exceeds ~40% for a Source, auto-retry once with a contrast/exposure-boosted variant; if that also fails, surface an explicit *"we couldn't read this clearly — retype the key details"* state rather than guessing. Implausibly short transcript relative to file size → `transcript_confidence:'low'` on the Source row, shown as an "unclear source" badge.

### 2.3 Extraction tool schema (strict)

```ts
{
  name: 'emit_claims',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false,
    required: ['transcript', 'claims'],
    properties: {
      transcript: {
        type: 'string',
        description: 'Best-effort verbatim transcription, line breaks as \\n. Used only to verify claim quotes are genuine substrings — never summarise, correct spelling, or interpret.'
      },
      claims: {
        type: 'array', maxItems: 60,
        items: {
          type: 'object', additionalProperties: false,
          required: ['claim_type','subject_raw','value_raw','quote','asserted_at_raw','date_precision_raw','page'],
          properties: {
            claim_type: { type: 'string', enum: ['medication','diagnosis','test_result','test_ordered','referral','appointment','instruction','observation','symptom','contact','admin'] },
            subject_raw: { type: 'string' },
            value_raw: { type: 'string' },
            quote: { type: 'string', description: 'Exact verbatim substring of transcript, character-for-character.' },
            asserted_at_raw: { type: ['string','null'] },
            date_precision_raw: { type: 'string', enum: ['exact','month','year','relative','unknown'] },
            page: { type: ['integer','null'] }
          }
        }
      }
    }
  }
}
```

**No `severity`/`urgency`/`rank`/`priority` field anywhere — this is a schema-level control, not a prompt instruction.** It is the single most important line in this whole document: the model has no slot in which to put a clinical judgement, so it structurally cannot make one.

Audio sources: same tool, called against an ASR transcript-with-word-timestamps (produced upstream, not by Claude); locator ms offsets are looked up in the timestamp table by code, not the model.

### 2.4 Substring-validation kill switch — exact algorithm

1. Build `normalized(text)`: NFKC unicode normalize → expand ligatures (ﬁ→fi, ﬂ→fl, ﬀ→ff, ﬃ→ffi, ﬄ→ffl via explicit map) → map smart quotes/dashes to ASCII (`'‘`→`'`, `""`→`"`, `–—`→`-`) → de-hyphenate line breaks (`/([a-z])-\n([a-z])/gi` → `$1$2`, lowercase-only to avoid merging real end-of-line hyphens) → collapse all whitespace runs (incl. `\n`) to one space → trim.
2. While building it, maintain `origIndexMap: number[]` — for every emitted normalized char, its index in the original transcript — so a normalized-string match range translates back to original char offsets for locator storage / PDF highlighting.
3. `idx = normalizedTranscript.indexOf(normalizedQuote)`. Found → `verified=true`, `char_start=origIndexMap[idx]`, `char_end=origIndexMap[idx+len-1]+1`. Not found → `verified=false`, claim **dropped**, never surfaced, never retried with a fuzzier match. No OCR-confusable fallback (0/O, rn/m) for anything shown to a user — a fuzzy match is not a verified citation.
4. Runs synchronously in the same request that persists claims, <50ms for a typical 2–5k char transcript, no model call. Produces the demoable number: *"N claims extracted, M dropped for unverifiable quotes."*

### 2.5 Claim grouping and conflict adjudication (deterministic, code-first)

**Grouping.** Step 1, pure regex/dictionary: lowercase, strip filler words (`tablets`, `once daily`, `po`), extract canonical drug name + numeric dose + unit via regex. A hand-authored synonym dictionary (~50–100 entries: "water tablet"→furosemide/diuretic-class, "blood thinner"→anticoagulant) is checked before any model call. Step 2, only for subjects that fail both: one batched Sonnet-5 call (`effort:'low'`) *proposes* candidate merges with a confidence field — it never confirms. Code applies the merge only if the merge would not collapse two claims with materially different values into one (those stay separate, linked "same-subject-candidate" for the conflict engine). Accepted model-proposed synonyms are logged to grow the static dictionary over time — the model's job shrinks demo over demo.

**Conflict adjudication — no model call.** After grouping, for every `subject_key` gather all non-superseded claims; differing normalized values (string/numeric diff, not semantic) → create a `Conflict` row referencing `claim_ids`, `resolution:'unresolved'`. Supersession is regex/keyword, not judgement: a later claim on the same subject containing an explicit update verb (`STOPPED`, `discontinued`, `changed to`, `ceased`) sets `superseded_by` on the earlier claim; otherwise both stay live and the Conflict stands. **The model is never allowed to decide which value is correct** — no schema field exists for it to do so.

### 2.6 Gap detection

**Pure-code detectors (zero model calls — date arithmetic / set operations over the claim table):**

1. `referral_without_outcome` — a referral claim with no later appointment/test_result/admin claim on the same specialty/subject within a configured window.
2. `repeat_test_due` — regex extracts "repeat in N weeks/months"; no later claim of that test type after `asserted_at+N`.
3. `document_references_absent_document` — regex over claim text ("see enclosed," "as per [X] dated," "clinical correlation advised") cross-referenced against `Source.doc_type/doc_date`; flags when no matching Source exists.
4. `medication_no_review_date` — medication claim with no matching review claim within a domain-configured window.
5. `stale_measurement` — a lab/vital claim older than a staleness threshold with nothing more recent on the same subject.
6. `statutory_clock` — today minus a dated claim (e.g. `checklist_positive_date`) vs a fixed day count (e.g. 28, for CHC).
7. `unclosed_conflict` — a Conflict row unresolved for >N days.
8. `missing_domain_coverage` — for ontology-mapped domains (CHC's 12 DST domains), zero Facts exist for that domain.

**Model-needed detectors, all Sonnet-5, all schema-forced to reference existing `claim_ids` only (never invent new facts):**

- (a) `well_managed_need_flag` — detects "stability language" (e.g. "settled," "no incidents") co-occurring with active-intervention evidence (PRN meds, hoist transfers) across nearby claims. Output is a fixed enum selecting a **pre-written citation id** from a lookup table (e.g. `para_162`) — the model never generates its own citation text, only picks which pre-authored one applies. This is the CHC hero feature and it is the one place the model touches paragraph citations at all.
- (b) `narrative_implied_gap` — semantically implied absences a date-diff can't catch (e.g. "clinical correlation advised" implying a follow-up letter should exist).
- (c) `narrative_conflict_candidate` — proposes claim_id pairs that might contradict in unstructured phrasing; code re-verifies the actual value diff before persisting a Conflict row, so a hallucinated conflict cannot reach the UI even if proposed.

### 2.7 Date resolution

Precision enum: `exact | day | month | year | approximate | relative_unresolved | unknown`.

1. Deterministic parse first (chrono-node or equivalent) against every `asserted_at_raw` — precision is set by which fields the parser actually filled.
2. Anything unresolvable ("a few months ago," "before the operation") batches into **one Haiku-4.5 call per case**, supplying the claim text, an explicit anchor date (Source's `doc_date` or case-creation timestamp), and any other already-resolved dates from the same Source. Output forces `{event_date: string|null, precision: enum, date_range:{min,max}|null, resolution_note:string}`. "Approximate" resolves to a `date_range` (midpoint + ± badge, never a fabricated exact date). "Before the operation" with no operation claim found resolves to `relative_unresolved`/`event_date:null` — becomes a clarification-question input, never a silent date. The model cannot output a precision finer than the source text supports — a schema constraint, not a prompt request.

### 2.8 Artefact generation

One call per artefact, same Fact store, different `ArtifactTemplate` row + JSON schema (adding a gatekeeper is a data change, not a new pipeline). `claude-sonnet-5` (or `opus-5` for a quality bump), `output_config.format=json_schema`, streamed. Because `citations:{enabled:true}` is incompatible with `output_config.format`, the model does not re-cite here — it receives already-verified Facts as structured input and only synthesises prose and chooses which supplied `fact_ids` support each section. Every emitted `supporting_fact_ids` array is validated post-call to contain only ids in the input set, or the field is discarded and replaced with the template's `gap_prompt`. No `severity`/`urgency`/`priority` field anywhere in any artefact schema.

### 2.9 Prompt caching

`cache_control:{type:'ephemeral'}` on the last block of the frozen system prompt + tool/schema definitions (rendered tools→system→messages). For extraction: safety/boundary rules + banned-terms list + tool schema (~800–1500 tokens). For artefact generation: also includes static domain reference data (NHS route table, CHC's 12-domain framework citations) — the single biggest cache win, identical across every case and regenerate click. `ttl:'1h'`, pre-warm with a `max_tokens:0` request on page mount, re-warm on an interval under the TTL for idle demo gaps. Never interpolate a timestamp or UUID into the cached prefix — it silently kills every hit. Verify via `usage.cache_read_input_tokens` on every call during rehearsal.

### 2.10 Retry and repair

`output_config.format` guarantees schema-valid JSON, so malformed-JSON failures don't happen. What's validated deterministically after every call: (a) every `supporting_fact_ids`/`gap_id` reference exists and belongs to this case; (b) a banned-terms regex scan (`triage`, `urgent`, `likely`, `diagnosis`, `you should`, `interact`, `eligible`, `meets the criteria`, ...) across every string field; (c) a runtime assertion that no `severity`/`rank`/`urgency`/`priority`-shaped key exists in the response object (belt-and-suspenders on the schema itself); (d) any `citation_required` slot with zero valid supporting facts must equal that slot's literal `gap_prompt` text, never fabricated prose.

On failure: exactly one targeted retry, reusing the cached prefix, listing only the specific violations found ("field investigations[1] referenced fact_id X which does not exist; field questions[2] contains the banned term 'urgent' — regenerate only these fields"). If the retry also fails: never surface unvalidated output — fall back to `gap_prompt`/omitted state and flag for manual review. The substring kill-switch (§2.4) is never a retry target — a failed-verification claim is dropped once, silently, by design. Network/5xx: SDK auto-retry (`max_retries=2`, exponential backoff); total failure falls through to a content-hash-keyed `DEMO_MODE` fixture as production-demo insurance, not a repair mechanism.

### 2.11 Full call graph and wall-clock

```
0) red-flag regex on concern text            — code, <10ms, HALTS pipeline if triggered
1) PARALLEL: one extraction+transcript call
   per uploaded Source (Sonnet-5)             — ~2–4s wall for 4 docs (Promise.all, not 4×)
                                                 each Source streams into Realtime as it completes
2) SERIAL join once all extractions resolve:
   deterministic subject-key grouping (code)  — ~50ms
   + optional grouping-assist call             — ~1–2s (parallel-eligible with 3, not with itself)
3) deterministic conflict adjudication
   + all 8 code gap detectors                 — ~50–100ms, concurrent with each other
4) PARALLEL: model gap pass (well-managed +
   narrative-gap + conflict-candidate)         — ~2–3s
   + Haiku-4.5 date-resolution batch           — ~1s   (independent, no shared dependency)
5) SERIAL join: timeline reduction (sort/
   dedupe by resolved date)                    — code, ~50ms
   TOTAL upload → fully-populated dashboard:   ~7–10s wall clock, first content ~2s via streaming
6) User-triggered, independent of the above:
   artefact generation, one streamed call
   per ArtifactTemplate                        — ~3–6s to completion, first tokens <1s
   two artefacts from the same Fact store can generate in parallel (cache already warm from #1)
```

---

## 3. The design system

Applies identically to CarePath, Handover, and the CHC pack — one shared component library, one provenance grammar.

### 3.1 Typography

- **Display/serif — Fraunces** (variable, opsz axis, wght 400/560/680). Google Fonts, fallback `Iowan Old Style, Georgia, serif`. Used only for: brief/pack masthead name-title line, landing headline, section dividers, and the conflict-card headline ("Three sources disagree about furosemide"). Nowhere else — punctuation, not wallpaper.
- **UI/body — Public Sans** (400/500/600/700). Fallback `-apple-system, "Segoe UI", Roboto, sans-serif`. Chosen over Inter because USWDS built and tested it for low-vision/older-adult legibility.
- **Verbatim/citation mono — IBM Plex Mono** (400/500). Fallback `ui-monospace, SFMono-Regular, Menlo, monospace`. Every direct quote, every locator ("p.3 · line 14"), every voice-clip timestamp. **The mono switch is itself the provenance signal**: Plex Mono = copied verbatim from a source; Public Sans = prose the product wrote.
- Self-host via `next/font`, 3–4 weights per family max — avoid a 4th webfont family under time pressure.

### 3.2 Colour (hex, WCAG-checked)

| Token | Hex | Notes |
|---|---|---|
| Background/paper | `#FAF7F2` | warm off-white, lower glare than pure white |
| Surface/card | `#FFFFFF` | |
| Ink primary | `#1C1B1A` | on paper = 15.8:1 |
| Ink secondary | `#55504A` | on paper = 6.1:1 |
| Hairline border | `#E7E1D8` | |
| Brand/primary | `#14453D` (deep forest-teal) | on paper = 9.6:1; on white w/ white text = 8.9:1 |
| Citation chip fill/border/text | `#E4EFEC` / `#A9C9C2` / `#14453D` | "anchored to a real page" — used nowhere else |
| Unverified/"you told us this" fill/border/text | `#FBEADD` / `#E8B98C` / `#9A4A15` | terracotta, not orange-500 — 5.2:1 |
| Conflict/disagreement fill/border/text | `#FFF4D6` / `#E0B94A` / `#7A5C05` | amber — distinct hue from teal and terracotta |
| Emergency red | `#B3261E` on `#FDEDEC` | 6.8:1. **Reserved exclusively** for the 999 halt card and its permanent banner. Never for validation/destructive/error states — those use neutral slate `#4A4640` + an icon. |

### 3.3 Spacing, radius, motion

- Scale (rem, root=18px): `0.25 · 0.5 · 0.75 · 1 · 1.5 · 2 · 3 · 4 · 6`. Card padding 1.5rem mobile / 2rem desktop. Section gaps 3rem. Never sub-4px gaps.
- Radius: 4px chips/badges/pills ("data"), 12px cards/panels ("content"), 20px primary CTA + modal sheets (reserved for 2–3 highest-commitment actions only — never a single blanket radius token).
- Motion: micro-interactions 120ms ease-out. Realtime timeline events: 320ms `cubic-bezier(0.16,1,0.3,1)`, 8px translateY + opacity, staggered 60ms. Panel expand 240ms via `grid-template-rows`, not JS height measurement. Page transitions: none (instant nav — a spinner between screens reads as broken to a fatigued user). Everything wraps in `prefers-reduced-motion: reduce` → 100ms opacity-only.

### 3.4 The provenance chip (the product's signature)

One shared `<ProvenanceTag>` component, two variants, enforced at the type level so a third "sourceless" state is unrepresentable (the component requires either a `citation` prop or `userStated: true`).

- **Citation chip**: 4px radius, `#E4EFEC` fill, `#A9C9C2` border, 13px Public Sans 600 `#14453D` text, document icon + source short-name + Plex Mono locator ("MRI report · p.3"). 32px min touch height even though visually compact. Hover/focus (or tap-and-hold): 320ms delay, then a popover — verbatim quote in Plex Mono with quotation marks and a 3px teal left-border, doc name + locator, "Open page 3 →" which mints a 60-second signed URL server-side and opens `{url}#page=3` in a new tab (native PDF viewer honours the fragment — no custom PDF viewer built). On mobile, tap opens a bottom sheet with the same content plus a full-width "Open document" button.
- **Orange "you told us this" badge**: same pill geometry, same 32px touch height, `#FBEADD`/`#E8B98C`/`#9A4A15`, speech-bubble icon, label text instead of a locator: *"You told us this — not from a document."* No hover popover — the badge is the full disclosure already.
- Never combined on one fact, never rendered with neither.

### 3.5 Uncertainty and missing information

Calm and structured, never a broken/red UI state:
1. "Not yet known" fields → dashed-border ghost-card, 12px radius, ink-secondary italic placeholder ("No review date recorded"), inline "+ Add this."
2. Approximate/imprecise dates → dotted underline on the date text itself, plus the word spelled out ("around March 2024," not a bare asterisked date).
3. A document that failed to extract cleanly → an honest, specific state ("We could read most of this page, but couldn't make out the handwritten note in the margin") with a thumbnail and "View the original" — never a generic error icon.
Palette across all three: slate/ink-secondary + the terracotta badge family — never red, never the triangular warning glyph (reserved for the 999 halt card).

### 3.6 The conflict card

The money moment (all three docs share it — Handover's furosemide dispute, CHC's medication-domain evidence, CarePath's gap panel all render through this same component). Full-width, 2.5rem padding, amber wash at 8% opacity. Header in Fraunces 22px — the only place outside a printed brief the serif appears mid-flow, deliberately, to slow the reader down at the highest-stakes card in the product. Below it: 3 chips in a horizontal row (stacked on mobile), equal weight, each a mini-card with source icon, source name, Plex Mono locator, and the quoted span in Plex Mono on a light provenance-coloured background. A voice-source chip carries 12–16 static waveform bars (not animated — cheaper, reads better on a bad projector) with a 40px circular play button; click plays real audio and animates a left-to-right fill. Below the chips: a bolded resolution line — *"This is now a question on the appointment brief:"* — followed by the generated question in a bordered callout (1px teal border, 8px radius, white fill). No accept/reject buttons in MVP — conflicts are always surfaced, never silently resolved. Entrance: scroll-into-view + 400ms scale-from-98%-to-100% (the only scaling transition in the product), and the resolving question appears a full 400ms after the chips settle — a deliberate beat of silence before the payoff.

### 3.7 Printable brief/pack

A4, brief-first for a six-second GP/MDT read. Masthead: plain rule (no logo), person's name in Fraunces 26px, "Prepared for [date] · reviewed by [Name]" in Plex Mono 11px beneath. One bold sentence stating the reason. A three-stat strip (numbers, not prose). Two-column body (`column-count`, not flex, for print reliability): left 60% = History / What's changed / Medications table; right 40% = Documents to bring / Priorities / Conflict callout (printed as a 20% grey fill box — colour prints unreliably). Bottom third: Questions to ask (numbered, coaching sub-line in italic) + Follow-up chase list (checklist + phone script in Plex Mono, readable aloud verbatim). Footer 9pt: disclaimer + "Reviewed and confirmed by [Name] on [date]" — this line, and printing itself, is gated behind the un-skippable review checkbox; before that, the print button reads "Review to unlock printing," disabled.

`@media print`: hide everything `.no-print` (nav, red safety banner — inappropriate content for a page a patient hands a clinician), `column-count:2; column-gap:2rem` with `break-inside:avoid` on every card/table, `@page{size:A4; margin:14mm}`, print-safe colour overrides (teal chip→black text+thin border; amber box→grey fill), `font-size:11pt` body/`9pt` footer/`18pt` masthead regardless of the 18px screen root, `window.print()` — no PDF library, the on-screen view is the print-ready DOM.

### 3.8 Accessibility

Root font-size 18px (not 16px), scaling to 20px under 480px viewport. All text ≥ WCAG AA (4.5:1 body, 3:1 large/UI); ink-primary/paper and teal/white pairs hit AAA (7:1+) deliberately. Holds at 200% zoom, no horizontal scroll, no clipping (rem units throughout). Touch targets: 44px WCAG minimum, 48px app-wide default, 56px primary CTA. Full keyboard path, visible 2px teal focus ring offset 2px, citation popover openable via Enter/Space with Escape to close. Never colour alone — every status (citation/unverified/conflict/gap/emergency) carries at least two of {icon, text label, shape/border-style}. Carer-mode vs self-serve is a template flag, not a UI fork: copy voice (first/third person), a consent-badge that only renders in carer mode, and carer mode defaulting to the 480px type scale on desktop too — everything else is the identical engine and screens.

---

## 4. Concept scoring, now properly grounded

Re-scored with actual design work behind four of five entries. MedRec and Owed are excluded from the comparison table below — their scores are unsupported (§1) and should not be cited as evidence of anything until someone actually writes the spec.

| Concept | Buyer clarity | Demo strength | 30h build risk | Engine reuse | Reg. safety | Total | Verdict |
|---|---|---|---|---|---|---|---|
| **CHC evidence bundle** (research/03) | 9 — funded advocacy firms, zero AI-native competitor | 8 — well-managed-need flag is judge-verifiable against a real gov.uk PDF live on stage | 7 — GO/NO-GO gated at H8, concrete 3-lane plan, hardest feature now has a bounded algorithm (§2.6a) | 9 — this *is* the reference implementation of the shared engine | 8 — outside FCA/reserved-activity scope, disclaimer copy shipped | **8.2** | **Primary artefact, this weekend** |
| **Handover — discharge cut** (single-writer, recovered) | 7 — real but unproven employer/insurer channel, argued verbally not shown | 9 — the conflict-card-with-audio beat, now fully specced visually (§3.6) | 7 — 80% reuse from the same engine, telephony correctly cut | 9 | 7 — typed declaration is an honest, admitted weak point | **7.5** (self-scored, matches recovered concept's own number) | **Second artefact, same evidence corpus** |
| **Handover — full spec** (multi-contributor, caregiver-shared-record) | 8 | 9 | 4 — telephony + live capture + second contributor, unbuilt this weekend | 8 | 7 | 7.5 (unchanged — no new design work recovered for this variant) | Roadmap; do not build |
| **Benefits/entitlement navigation** ("Owed," social-care navigation) | 9 — cleanest regulatory ground of all five | not evaluable (no spec survived) | not evaluable | high (deterministic rules pass over the same Fact store) | 10 — welfare-benefits advice is unregulated | not scorable | Already captured as a one-line AA add-on inside Handover; not a standalone build |
| **Medication reconciliation** ("MedRec") | not evaluable | not evaluable | not evaluable | subsumed — `claim_conflicts` already does this | not evaluable | not scorable | Not a concept, a feature. Already inside every other build. |
| **GP appointment brief / chronic-illness gap panel** (research/01, Maya) | 3 — proven-weak consumer WTP (5% willing to pay, median $28/mo) | 8 — the gap panel is genuinely differentiated | 8 — simplest regulatory story, cleanest build | 8 | 9 | **7.2** (implicit, from 01's own numbers) | Coda, not headline |

**Does 03's CHC-first ranking survive?** Yes, and it is now better evidenced than when it was written. 03 ranked CHC > discharge > benefits > GP brief > insurance on buyer clarity and harm evidence alone, with an admitted engineering risk ("the risk is that the domain-mapping and well-managed-need engine works beautifully on four hand-authored documents and fails to generalise"). The recovered pipeline lens directly answers that risk: it gives a concrete, schema-forced, citation-locked algorithm for the well-managed-need detector (§2.6a) with a hard precision floor built into the design (the model may only select a pre-written citation id, never generate one), which is exactly the zero-fabrication guarantee 03 §11 demanded as the pass bar. The recovered visual lens gives CHC's dashboard an equally strong design language as Handover's conflict card, closing the one gap where 02's demo previously looked more "finished" on paper. **03's ranking holds and strengthens.**

**Does 02's internal ranking survive?** No. 02 scored its own winning concept (8.5) against a CHC entry (5.5) that had no design work behind it and was explicitly marked "completely undemoable" — a claim 03 then falsified by building a complete 30-hour plan for it. Once the actual Handover spec is recovered, it self-scores 7.5, below CHC's evidenced 8.2. **02's concept ranking is superseded by 03's; its underlying engine spec (Claim/Fact/Conflict tables, `has_care_access` RLS trick, persona/document set) remains fully valid and load-bearing.**

---

## 5. Final build recommendation

Build **one engine**, per §2, seeded with **one persona family** — Margaret Ellis and her daughter Sarah — and generate **two artefacts from the identical evidence corpus, in this order**: the **CHC Evidence Pack first**, because 03's ranking survives and strengthens (§4): it has the clearest non-patient buyer, the sharpest "why now" number (31%→17% eligibility collapse), zero AI-native competitors, and a hero feature — the well-managed-need flag citing National Framework para 162 verbatim, checkable live against the real gov.uk PDF — that a judge can fact-check in front of you, which no gap panel or conflict card can claim. Fold Handover's signature demo beat into this pack rather than running it as a separate concept: the furosemide three-way disagreement (discharge letter, prescription photo, a voice note) is not a bolt-on, it *is* evidence for the "Drug therapies and medication" DST domain — one of only four domains that can hit the Priority ceiling — so the conflict card (§3.6), audio and all, becomes the demo's money moment **inside** the CHC dashboard rather than competing with it. Close by clicking "Generate GP Appointment Brief" from the same Fact store — the reveal 03 already scripted — to land 01's "one engine, any gatekeeper" claim without needing Maya as the headline persona; keep Maya as the 25-second self-serve coda 02 already recommended, reusing the existing seeded dataset at zero extra build cost. This resolves the three-way tension directly: 03 wins the wedge and the buyer story, 02 wins the single most memorable on-stage moment, and 01 wins the closing architectural flourish — all three off one dataset, one pipeline, one design system, none of them contradicted.

---

## 6. Deltas to apply

**To `prd.md`:**
1. §title/subtitle and §19.3 model calls — replace any implicit "Opus 5 for everything" assumption with: Sonnet 5 default across extraction/grouping/gap-detection, Haiku 4.5 for the batched date-resolution call, Opus 5 as an optional hand-toggled upgrade for artefact prose only (§2.1).
2. §6 Non-goals — merge in 02 §7.5's elder-care non-goals list (no falls/frailty score, no drug-interaction checking, no severity/red-flag label, no automated safeguarding referral, etc.) — these apply to the CHC/Handover build too, not just elder-care.
3. §7 Target users — reorder: Sarah (operator/carer) and Margaret Ellis (subject) become the primary demo pair; Maya becomes the explicit 25-second coda persona; drop or merge Daniel (tertiary, unused in any recovered build). Delete the line "Caregiver access should remain outside the hackathon MVP unless time permits" (already flagged by 02 for removal; now doubly overturned since Sarah is the primary operator, not a stretch feature).
4. §14.4 Route categories — replace the urgency-tiered enum (`EMERGENCY_NOW`, `URGENT_SAME_DAY`, ...) with 01 §6's eligibility/access enum (`route_id`: self-referable vs needs-GP-referral, no urgency tiers at all) — 01 already made this regulatory call and prd.md's FR-8/§14.4 was never updated to match.
5. §20 Suggested database schema — add `claims`, `claim_conflicts`, `care_relationships` (per 02 §4), and `artifact_templates`/`artifacts`/`assertions` (per 03 §5) as first-class tables; the existing `facts`/`timeline_events`/`gaps` shape becomes the reconciled layer sitting on top of `claims`, not a replacement for it.
6. Add a new §"Design system" (or link out to this document's §3) — prd.md currently specifies zero typefaces, hex values, or a spacing scale.
7. §23 Structured-output schemas — add the `emit_claims` tool schema (§2.3) and the substring-verification contract (§2.4) as the canonical extraction interface; the existing `TimelineEventSchema`/`CarePlanSchema` become downstream reductions, not the extraction target.

**To `research/01-carepath-market-and-build.md`:**
1. Subtitle — change "Claude Opus 5" to "Claude Sonnet 5 (Opus 5 upgrade path for artefact prose)".
2. §5 Pass A — remove `citations:{enabled:true}`/`NO output_config.format` design entirely; replace with the forced strict tool-use extraction + self-report transcript + substring kill-switch from §2.2–2.4 of this document.
3. §5 schema — add `claims` and `claim_conflicts` tables under `facts`, per §2.5 here; `facts` becomes the reconciled/grouped layer, not the direct extraction target.
4. §5 — add the exact wall-clock and cost figures from §2.11/2.1 here (currently 01 only asserts "7-10s" informally via the demo script; this document is the source of record for that number now).

**To `research/02-eldercare-opportunity.md`:**
1. §5 Hour-by-hour — delete H14–18 (outbound ElevenLabs call, keypad consent, SMS fallback) and H18–21 (live voice-note capture on stage); replace with the typed acting-for declaration (§7.2's carer-side declaration copy, already written in 02, now confirmed as the actual mechanism rather than a fallback). A single pre-recorded, pre-transcribed voice note remains in the demo.
2. §3 Scores table — retract the CHC 12-domain evidence mapper's 5.5/"undemoable" entry; replace with a cross-reference to research/03 and this document's §4 (8.2, now the top-ranked concept).
3. §3 Scores table — annotate "Handover — discharge cut, 8.5" with a footnote: the version actually specced and recoverable this weekend scores 7.5 (§4 here); 8.5 was for a build nobody is shipping.
4. §4 "Model choice" line — change "claude-opus-5 commercial API throughout" to match §2.1 here (Sonnet 5 default, Haiku 4.5 for dates, Opus 5 optional for prose).
5. §6 demo persona — note that Margaret Ellis/Sarah Ellis is now the shared persona across the CHC build too (research/03 independently used the same first name for its own persona at a different age/situation); pick one canonical Margaret Ellis biography and reuse it in both, per §5 of this document.

**To `research/03-chc-entitlements.md`:**
1. §9 Three-lane build plan — insert the exact call graph and wall-clock numbers from §2.11 of this document (03 currently gives hour-blocks but no per-step latency/cost model).
2. §2 well-managed-need principle / §5 shared engine — cross-reference §2.6(a) of this document for the exact schema-forced, pre-written-citation-id mechanism that makes the detector's fabrication risk structurally zero, not just process-mitigated.
3. §8 Demo script — fold in the conflict-card beat (discharge letter + prescription photo + voice note disagreeing about furosemide, inside the "Drug therapies and medication" domain) as specified in §5 of this document, in place of or alongside the current single-source Breathing-domain reveal at 0:40–1:15.
4. Add a cross-reference to §3 of this document for the CHC dashboard's visual design — 03 currently has no typography/colour/spacing spec at all.
