# CarePath — Decision Document
**Consumer Health Hackathon, 25–26 July 2026 · UK/NHS · Claude Opus 5 + Supabase + Next.js**

---

## 1. Verdict

Build it — but build the half nobody else can, and stop calling it navigation. CarePath should be **a document-native record assembler for people with long-term conditions that tells them what is *missing* from their own medical history before they walk into a nine-minute appointment**, and hands them one printable page titled *"What I want to tell my doctor."* The sharpest wedge is **absent-information reasoning**: every product in this landscape summarises what you have; nothing reasons about the letter that references a scan you've never seen, or the referral made nine weeks ago with no outcome recorded — and OpenAI shipped ChatGPT Health to US users yesterday with the UK, EEA and Switzerland explicitly excluded, so the UK-shaped version of this is genuinely open for the next 18 months.

---

## 2. Market reality

**The demand is documented, UK-specific, and three months old.**

| Number | Source |
|---|---|
| **66%** of NHS patients/carers hit ≥1 admin problem last year — up from 64% | Healthwatch England / King's Fund / National Voices, Apr 2026 (Ipsos, Dec 2025) |
| **75%** of patients with a long-term condition vs **57%** without | Healthwatch England, Feb 2025 |
| **71%** of patients whose referral fell into a black hole only found out because they chased it themselves | Healthwatch, Dec 2025 (YouGov, n=2,622) |
| **9 minutes** — mean UK GP consultation; 92% finish under 15 min vs 27% in comparator countries | Irving et al., BMJ Open 2017; Health Foundation |
| **40–80%** of medical information is forgotten immediately; half of the rest recalled wrong | Kessels, J R Soc Med 2003 |
| **28.9** primary care consultations in 2 years for people with 4+ conditions, vs 10.0 for one | Health Foundation |
| **~3 in 10** LTC patients say they lack support to manage their conditions | GP Patient Survey 2026, published 9 July 2026, n≈654,000 |

The precise, defensible framing: **access is improving, coordination is not.** GPPS 2026 shows 72.6% rate contacting the practice as good, up 5.3pp in two years. Do not say "the NHS front door is broken" — a judge will know. Say "the front door got better and the corridor behind it didn't."

**Who actually pays: not the patient.** Solace Health raised a $130M Series C in Feb 2026 at a >$1B valuation doing exactly this job with human nurse advocates — and bills Medicare, not patients. Transcarent/Accolade: $621M, 20M+ members, employer-funded. Every UK survivor in the adjacent category went B2B: Healthily to insurers, Ada to health systems at $10–50k/month, Wysa into NHS Talking Therapies. UK analogues are **Juno subscription tier, condition charities (Versus Arthritis, Diabetes UK, Macmillan), ICB/PCN demand-shaping, and private insurers.** Value-anchor against the human price — independent advocates charge $150–225/hr, Cleveland Clinic charges $1,690 for a virtual second opinion, UK remote case reviews run £500–£1,000 — never against a subscription price.

**The honest weak spot — say it before a judge does:** there is *no published evidence* that an AI-generated timeline plus a patient-authored brief improves consultation efficiency or outcomes. Nobody has run that trial. The problem is extremely well evidenced; the solution is a hypothesis. And UK consumer-direct WTP is the weakest link in the whole thesis: Zoe cut its membership 60% (£24.99 → £9.99) and lost >£20m on near-halved revenue in FY25; PHIN shows self-pay admissions up 0.2% in 2025. "Consumers will pay £9.99/mo" is the worst available answer to "who pays."

---

## 3. Competitive wedge

**The one thing: CarePath reasons about what is absent from your record. Everything else in the market reasons about what is present.**

- **ChatGPT Health** answers the question you asked, from what you gave it. It has no model of what a complete record for your condition looks like. It also does not run in the UK — the rollout began 23 July 2026 and eligibility explicitly excludes the UK, EEA and Switzerland, because MHRA has indicated it would be a regulated device here and record integration runs through b.well, which has no UK provider graph.
- **NHS App** (26.9m distinct users in the year to March 2026) is a *viewer*. It shows you what exists. Historic entries are often not even there — most practices only enabled prospective access. Same for PKB (6M+ registered), Evergreen Life (3M+), Airmid, Patient Access. Record access is being solved and is heading toward a government mandate. Comprehension is not.
- **Ada / Healthily** don't do this at all — and the killer detail is that Healthily's Class I symptom checker **explicitly excludes people with complex or long-term conditions.** The regulated tools refuse the exact cohort CarePath serves, because triage is the wrong instrument for a six-year illness.
- **Guava Health** (the closest real competitor) does chronic-illness record ingestion and AI visit prep — for the US portal graph, with no route layer and no gap analysis. Name it on stage. "Yes, someone built the timeline half, in the US, for a record graph that doesn't exist here."

**Why it's defensible in 30 hours:** absent-information reasoning is only possible on top of a citation-anchored extraction layer. You cannot say "there is no U&E result after 12 July" unless you know, verbatim and page-anchored, every result you *do* have. The provenance architecture and the gap engine are the same investment. And half the gap detectors are **deterministic code** — regex + date arithmetic over extracted facts (referral with no subsequent outcome; "repeat in 6 weeks" with no later result; a letter referencing a document you don't hold; a medication with no review date). When a judge asks "how do you know it isn't making that up?", "that one is a date comparison, not a model output" ends the question.

Rehearsed 20-second answer to *"why not ChatGPT Health?"*:
> "Three reasons. It doesn't run here — the UK is explicitly excluded and MHRA is why. Its output is a chat transcript; ours is a one-page artefact for a nine-minute NHS consultation, page-cited back to the source PDF. And it answers what you ask. We tell you what's missing — which is the opposite thing."

---

## 4. What to actually build this weekend

**Five user-visible capabilities. Not nine. Nine half-working screens loses on every rubric axis simultaneously.**

1. **Drop in a shoebox.** Drag 4 PDFs onto a seeded case (scanned discharge letter, MRI report, physio referral, blood panel). Claude reads them natively — no OCR pipeline.
2. **A timeline where every single item is page-cited.** Each event carries either a citation chip (`document_title` · p.3 · verbatim `cited_text` on hover, click → opens the PDF at that page) **or** an explicit orange *"you told us this — not from a document"* badge. Zero events with neither. Events streamed into the UI as extraction lands.
3. **The gap panel — the hero, and the most demo time.** 3–5 items, scoped to *the record*, never to the care:
   > *"Your 29 Jul 2025 MRI report says 'clinical correlation advised'. There is no clinician letter in your records after that date."*
   > *"Your 12 Mar discharge letter asks for repeat U&Es in 6 weeks. There is no U&E result after 12 Mar."*
   > *"Your rheumatology letter references a DEXA scan. You haven't uploaded a DEXA report."*
4. **An access-route card + a deterministic red-flag halt.** The card answers *"how do I get there"*, not *"how urgent is this"* (see §6 — this is the load-bearing regulatory decision). Plus an always-visible, non-personalised 999/111 panel rendered identically for every user.
5. **The artefact.** One printable page, **"What I want to tell my doctor"**: reason for the appointment · history in 3 paragraphs · what changed · documents to bring · my top 3 priorities · 5 questions **with coaching** (*"ask this one first; if they say X, follow up with Y"*) · a 4-item follow-up chase list with a script for each call. Mandatory un-skippable *"I have read and corrected this"* checkbox before print.

**Brutal cuts — roughly 14 of 30 hours reclaimed:**

Auth UI, the profile wizard, the consent flow, the extraction-review approval *gate*, the one-question-at-a-time clarification loop, post-appointment intake, ElevenLabs, PDF generation (browser print is identical), multi-case management, pgvector.

**Greyed-out roadmap tiles** (say *"we cut these deliberately to make five things work properly"* — it scores as engineering judgement, not incompleteness): post-appointment outcome capture, shareable clinician link, Juno chat import beyond the seeded JSON, caregiver access, multi-country routing.

**Protect in this order if you fall behind:** gap panel → deterministic red-flag layer → citation constraint → follow-up chase list. Those four *are* the differentiated product. The timeline and the brief are table stakes every team will have.

---

## 5. Architecture decision

**Stack.** Next.js 16 App Router on Vercel (`vercel.json: {"regions":["lhr1"]}`) + Supabase **London / eu-west-2** + raw `@anthropic-ai/sdk` calling `claude-opus-5`. Anthropic **commercial API under Commercial Terms — never claude.ai**; the DPA and UK IDTA come with the commercial tier automatically and the consumer tier has neither. Production residency path is AWS Bedrock UK region. Say out loud that HIPAA-ready is not a UK GDPR Article 9 answer.

**Hard rule, put it in CLAUDE.md: Server Actions never call Anthropic.** They block the router transition and make a 30-second call look like a frozen app. All model work lives in Route Handlers (`runtime = 'nodejs'`) returning a stream. Server Actions do CRUD only.

**Auth: Supabase anonymous sign-in.** Kill the auth *UI*, not auth. `signInAnonymously()` gives a real `auth.uid()`, so RLS is written once, there is no service-role escape hatch in the request path, and guest→registered later is a one-line `updateUser({email})` with no data migration. Fifteen minutes, not four hours. Check the Anonymous Sign-Ins toggle in hour one.

**Three Claude passes, not six.**

```
PASS A  per document, parallel, effort:'low'
        citations:{enabled:true}  ·  NO output_config.format
        ⚠ these two are INCOMPATIBLE — returns 400. Discover this in hour one.
        → facts[] {label, value, cited_text, doc_title, page}

PASS B  one call, effort:'medium', output_config.format = json_schema
        input = facts[] + seeded Juno diary + concern text. NO PDFs attached → fast, cheap.
        → {timeline_events[], gaps[], brief, questions[], followups[]}
        VALIDATION AT THE BOUNDARY (code, not prompt):
          · event referencing a non-existent fact_id → DROPPED silently
          · event with empty fact_ids → renders with the unverified badge

PASS C  one call, effort:'high', strict tool
        select_route({route_id: enum, evidence_fact_ids: string[], missing_information: string[]})
        strict:true, additionalProperties:false
        Kept SEPARATE so the on-stage re-run is ~3s, not 25s.
```

Pass B can only reason over spans Pass A anchored to a page. **That is not a workaround for the API constraint — it is the safety architecture.** Say that sentence on stage.

**Thinking config (2026 API — get this wrong and you 400):** `thinking: {type:'adaptive', display:'summarized'}`. `budget_tokens` is **removed** and errors on Opus 5. `effort` lives inside `output_config`, not top level. Default `display` is `'omitted'` — you will get empty blocks and an unexplained pause unless you set it.

**Files API + prompt cache.** Upload each PDF once (`files-api-2025-04-14` beta header on **both** the upload and every referencing `messages.create`), store `claude_file_id`, reference across all downstream calls. Frozen system prompt + the NHS route table behind one `cache_control:{type:'ephemeral'}` breakpoint (>512 tokens, Opus 5's minimum). **Audit the prefix for `new Date()` or `crypto.randomUUID()`** — one interpolated timestamp silently kills every cache hit and you run at cold latency in front of judges. Pre-warm with `max_tokens: 0` on screen mount, re-warm every 4 minutes (5-min TTL).

**Schema — five tables. The rest are jsonb columns.**

```sql
create type provenance as enum ('user_stated','document_extracted','system_inferred','unknown');
create type route_id   as enum ('PHARMACY_FIRST','GP_ROUTINE','MSK_PHYSIO_SELF_REFERRAL',
                                'EXISTING_TEAM_FOLLOW_UP','SPECIALIST_VIA_GP','NOT_ENOUGH_INFORMATION');
create type gap_kind   as enum ('missing_document','missing_result','unstated_value',
                                'unclosed_referral','stale_measurement');

cases(id, user_id default auth.uid(), concern_text, red_flag_triggered bool default false,
      red_flag_rules text[], route jsonb, brief jsonb, questions jsonb, followups jsonb,
      user_reviewed bool default false, is_demo bool, created_at)
      -- red_flag_* are written ONLY by lib/red_flags.ts. Put that in a column comment.

documents(id, case_id, user_id, storage_path, file_name, sha256, claude_file_id,
          status, doc_type, doc_date, page_count)
      -- sha256 is load-bearing twice: DEMO_MODE fixture key + dedupes re-uploads mid-demo.

facts(id, case_id, user_id, document_id, fact_type, label, value_text, unit,
      reference_range, effective_date, date_precision, provenance, confidence,
      cited_text, source_page,
      constraint fact_must_cite check (
        provenance <> 'document_extracted'
        or (document_id is not null and cited_text is not null and length(cited_text) > 0)))

timeline_events(id, case_id, user_id, event_date, date_precision, title, detail,
                fact_ids uuid[], provenance)

gaps(id, case_id, user_id, kind gap_kind, headline, evidence_text,
     evidence_fact_id, expected_by, severity, suggested_question, detector text)
     -- detector = 'deterministic' | 'model'. You will want to say which on stage.
```

`fact_must_cite` **is the product thesis expressed as DDL**: a claim sourced to a document with no verbatim span is physically unstorable. Budget 30 minutes for the graceful path — on constraint violation, downgrade to `provenance='unknown'` with a visible badge rather than dropping the fact.

`reference_range` is copied **verbatim from the lab**. Never render an app-generated high/low arrow, colour or "abnormal" flag — that interpretation step is what crosses the MHRA line.

**RLS.** Enable on every table. One policy shape: `using (user_id = (select auth.uid()))` — wrap `auth.uid()` in a scalar subquery so Postgres evaluates it once per statement, not per row (matters when 200 facts insert at once). `user_id uuid not null default auth.uid()` means inserts can't spoof it. Storage path convention `{user_id}/{case_id}/{doc_id}.pdf` makes the bucket policy a prefix check. **Show this policy on screen for four seconds and say "enforced in Postgres, not in our app code."**

**Perceived latency: write rows, subscribe to them.** `alter publication supabase_realtime add table facts, timeline_events;` — the client subscribes to `postgres_changes` filtered by `case_id` and events pop into the timeline one at a time as extraction lands. Best visual-to-effort ratio in the entire build, survives a dropped connection, and beats watching JSON assemble. Stream the model to the client in exactly one place: the brief prose.

**Citation viewer in 15 minutes, not 4 hours:** Route Handler mints a 60-second `createSignedUrl`, UI opens `${url}#page=${source_page}`. Native browser PDF viewer honours `#page=`. The verbatim `cited_text` popover carries most of the trust payload anyway.

**Demo insurance.** `lib/ai/client.ts` is the *only* module importing the SDK. `DEMO_MODE=fixtures` looks up `fixtures/{sha256}.{phase}.json`, sleeps 400–900ms, returns it. Same four PDFs → identical run, zero network calls. Build the recorder at **H4–H8, not H26**. `?demo=1` forces fixtures per-session so you can run live if wifi is good and flip in one URL if it isn't.

---

## 6. The safety layer

**This is the differentiator. It is also the section where I overrule the original spec.**

### The decision: CarePath answers "how do I get there", not "how sick am I"

NHS 111 online — which explicitly does *not* diagnose and only tells you what to do next — **is itself a registered Class I medical device under UK MDR 2002.** "We just signpost" is the literal intended-purpose statement of a registered device, not an escape hatch. MHRA's symptom-checker appendix names triage signposting *and* "an indication of seriousness" as in-scope device outputs.

So: **urgency leaves the model entirely.** The model-selectable enum contains **no urgency tiers**. `GP_SAME_DAY` is cut — same-day-vs-routine *is* a seriousness judgement. `A_AND_E_999` and `NHS_111` are cut from the enum — those are reached only by the deterministic layer or the always-on panel. What remains is an **eligibility/access map**: is this self-referable in England, and if not, what gets you the referral.

```ts
// lib/nhs_routes.ts — ~90 minutes, hand-authored. This file is the technical moat,
// the regulatory answer, and the "why not ChatGPT" answer simultaneously.
{ id: 'MSK_PHYSIO_SELF_REFERRAL',
  label: 'MSK physiotherapy',
  self_referable: true,
  eligibility_text: '<verbatim NHS.uk quote, OGL-attributed>',
  source_url: 'https://www.nhs.uk/...',
  caveat: 'Self-referral availability varies by ICB area.' }
```

**The model returns an id. The UI renders `eligibility_text` from the table. Never model prose.** Do not call the Directory of Services API — v1/v2 were deprecated 2 Feb 2026 and syndication is mid-migration. A static OGL-attributed snapshot is both safer regulatory ground (retrieved and quoted, not generated) and buildable in an hour.

### Deterministic red flags — `lib/red_flags.ts`

Pure TypeScript, no dependencies, unit-tested, runs on the concern text **before any Claude call**. Runs over the concern field and the "what's changed" field **only — never over uploaded documents** (a discharge letter mentioning historical chest pain would fire on every run).

On hit: **the pipeline halts. No model call is made.** Render a fixed card.

| # | Rule | Trigger terms (abbreviated) |
|---|---|---|
| 1 | **Cardiac chest pain** | central/crushing/tight chest pain; pain radiating to arm, jaw, neck, back; chest pain + sweating / nausea / breathlessness |
| 2 | **Stroke (FAST)** | face drooping, arm weakness, slurred or garbled speech, sudden confusion, sudden loss of vision in one or both eyes |
| 3 | **Airway / breathing** | can't complete a sentence, gasping, choking, blue or grey lips/face, stridor, noisy breathing |
| 4 | **Anaphylaxis** | swelling of lips/tongue/throat, difficulty swallowing, wheeze + rash after exposure, sense of impending doom |
| 5 | **Sepsis** | slurred speech + confusion, extreme shivering or muscle pain, passing no urine in a day, severe breathlessness, "feel like I'm going to die", mottled/discoloured/blue skin; child: non-blanching rash, cold hands and feet, abnormally fast breathing, fits |
| 6 | **Uncontrolled bleeding** | bleeding that won't stop with pressure, vomiting blood, coughing up blood, black tarry stool, large volume of blood in stool |
| 7 | **Collapse / seizure / head injury** | loss of consciousness, first-ever seizure, seizure >5 min, not waking after a seizure, head injury with vomiting / confusion / unequal pupils |
| 8 | **Thunderclap headache / meningism** | worst headache of my life, sudden severe headache; headache + neck stiffness + light sensitivity + rash |
| 9 | **Cauda equina** | new loss of bladder or bowel control, numbness around genitals/anus (saddle), new weakness in both legs with back pain |
| 10 | **Acute ischaemia** | sudden cold/pale/pulseless painful limb; sudden severe testicular pain and swelling |
| 11 | **Self-harm / suicidal intent** | plan, means, intent, has already taken an overdose |
| 12 | **Obstetric** | heavy vaginal bleeding in pregnancy, severe abdominal pain in pregnancy, reduced fetal movements |
| 13 | **Metabolic** | vomiting with high blood sugar or high ketones, hypo not responding to treatment, new severe drowsiness or acute confusion |
| 14 | **Acute eye** | sudden painless loss of vision, severe eye pain with halos and vomiting |

**Negation and tense guard** (5 tokens either side): `no ·  not · denies · never · without · used to · previously · in 2019 · history of · resolved`. So "no chest pain" and "history of chest pain in 2021" do not fire. Test both on stage if a judge asks.

### Output guardrail — `lib/output_filter.ts`

Runs on **every** model output before persistence. Rejects any string containing routing verbs (`go to`, `you should see`, `contact your`), urgency terms (`urgent`, `immediately`, `within 24 hours`, `emergency`, `as soon as possible`), likelihood language (`likely`, `suggests`, `consistent with`, `could be`, `probably`, `indicates`), or a condition name not present verbatim in a cited source span. On trigger: store nothing, return the refusal card.

**The guardrail is code, not a system prompt.** MHRA's AI Airlock Phase 2 report says explicitly that "we constrained the prompt" is not accepted as evidence of staying within intended purpose. Treat all uploaded document text as **data, never instructions** — a crafted PDF is a live prompt-injection vector, and the filter runs on output regardless of origin.

Before the demo: **grep every string in the UI** for condition names, `likely`, `suggests`, `consistent with`, `probably`. If the route card ever shows a condition name or a probability, you have lost the symptom-checker argument.

### Exact disclaimer copy

**Intended purpose statement** — write this in hour one, put it in the app footer, on the landing page, and at the top of the README. All UI copy must obey it. MHRA reads websites and screenshots; your demo is promotional material.

> **CarePath helps people living with long-term conditions organise their own medical records and prepare for healthcare appointments. It does not assess symptoms, does not provide a diagnosis, and does not tell you how urgent your problem is. If you need to know how urgent something is, use NHS 111 online.**

**Always-on banner** — every screen, identical for every user, never conditional on input. (A *conditional*, symptom-triggered alert is exactly the "indication of seriousness" output MHRA classes as a device function.)

> **If someone is seriously ill or injured and their life is at risk, call 999.**
> Not sure how urgent it is? **111.nhs.uk** or call 111. CarePath does not assess urgency.

**Red-flag halt card:**

> ## CarePath has stopped.
> Some of the words you used appear on the NHS's own list of symptoms that need immediate attention. **We have not assessed you** — we've simply stopped, because this isn't something to prepare an appointment for.
>
> *[verbatim NHS 999 guidance text + source link, OGL-attributed]*
>
> **Call 999 now.**
> Not sure? **NHS 111 online can assess this. It is a registered medical device. We are not.**

**Route card sub-header:**

> **How you get there.** CarePath does not assess how urgent this is — that's what NHS 111 online is for. This card shows how this service is accessed in England, quoted from NHS.uk.

**Brief footer** (printed on the physical page):

> This document was written by **[Name]** using CarePath. It is a patient's own account of their history, assembled from documents they uploaded and reviewed. It is **not a clinical record, not a clinical summary, and has not been reviewed by a clinician.** Every dated item links to the page of the document it came from. Reviewed and confirmed by [Name] on [date].

Never title it "clinical summary", "handover", "referral" or "SBAR". NHS England's June 2025 Priority Notification requires AI tools performing *clinical summarisation* to be registered as at least Class I. The addressee is the patient; the GP is merely who the patient chooses to hand it to.

**Timeline badge for uncited events:** *"you told us this — not from a document"*.

### The exact on-stage regulatory line

Say this. Do **not** say "this is not a medical device."

> "Route signposting sits close to the MHRA software-as-a-medical-device line. NHS 111 online doesn't diagnose either, and it's a registered Class I device. So we didn't write a disclaimer — we designed the model out of the seriousness judgement. Red flags are a deterministic rule list that runs before any model call. The route is a constrained enum over a table we hand-wrote. The copy on the card is published NHS content quoted verbatim with a source link. And a Nature Medicine study in February found ChatGPT Health under-triaged 52% of gold-standard emergencies — chronic-illness patients are definitionally the atypical-presentation cohort it misses. That's why we don't do urgency at all. Our roadmap for the routing module is the AI Airlock sandbox and DCB0129, following Wysa's path."

### Three compliance artefacts in the repo (~2 hours; almost no other team will have any)

1. **One-page DPIA-lite** — purpose, data categories, Art 6 lawful basis + **Art 9(2)(a) explicit consent**, UK IDTA transfer mechanism to Anthropic, retention (anonymous users deleted at 24h), residual risk.
2. **Stub DCB0129 hazard log**, six real hazards: hallucinated timeline entry · missed red flag · wrong medication dose extracted · prompt injection via uploaded PDF · automation bias in a cohort routinely dismissed by services · user over-relies on route card.
3. **Architecture diagram drawing the MDCG 2019-11 Rev 1 module boundary** between the non-device product (timeline / gaps / questions / follow-ups / brief) and the delegated triage (NHS 111 hand-off). Module-by-module assessment is formalised in Rev 1 (June 2025) — this diagram *is* the compliance argument.

**Demo on synthetic personas only.** UK GDPR Article 9 special-category data plus a public stage plus venue wifi is a live breach, not a hypothetical.

---

## 7. Demo script

**Script to 2:45. Strongest beat at 2:10.** Rehearse ×5 against a timer. Designate a co-presenter who can take the screen share instantly.

**0:00–0:20 — Cold open. No product, no tech, no team intro.**
One slide: a photograph of an actual pile of NHS letters.
> "This is Maya. She's 34, she has hypermobile EDS, and she's seen eleven clinicians in three years. Every one of them asked her to start from the beginning. Her ankle's swelling again and she genuinely doesn't know whether to call her GP, her physio, or 111."
Land it. Stop.

**0:20–0:35 — The one stat, and yesterday's news.**
> "Two-thirds of NHS patients hit an admin problem last year. Seventy-five percent if you have a long-term condition. That's Healthwatch England, three months ago, and it got *worse*. And yesterday OpenAI shipped ChatGPT Health to US users — the UK, EEA and Switzerland are explicitly excluded, because MHRA says it'd be a regulated device here. Nobody is building this for the NHS."

**0:35–1:00 — Live upload.**
Switch to the app. One line of concern text. Drag in four PDFs.
> "Real-format documents — one of these is a photocopy. Claude reads the PDFs natively. There's no OCR pipeline."
Do **not** fill the silence with architecture. The upload animation is the beat.

**1:00–1:30 — Timeline builds live.**
Events stream in one by one via Supabase Realtime. Hover one.
> "MRI, 29 July 2025 — bone-marrow contusion. Page 3 of her MRI report. Every event on this timeline is anchored to a page in a document she uploaded, and the database physically cannot store a fact that claims a document source without a verbatim quoted span. Nothing here was invented."

**1:30–2:00 — The gap panel. Slow down here.**
> "This is the part nobody else does. ChatGPT answers what you ask it. The NHS App shows you what you have. This tells Maya what's *missing*."
Read one aloud, verbatim off screen:
> "'Your 29 July MRI says clinical correlation advised. There is no clinician letter in your records after that date.' Two of these five are pure date arithmetic over extracted facts — that one's code, not a model output."

**2:00–2:10 — Route card.**
> "It doesn't tell her how urgent this is. It tells her how you *get* there: MSK physio is self-referable in England; rheumatology isn't — that needs a GP referral. The model picks an index into a table we hand-wrote; the copy is NHS.uk, quoted verbatim, with the link."

**2:10–2:25 — THE MONEY MOMENT. Do not cut this for time.**
Type into the live box: *"chest pain going into my left arm and I'm sweating."*
The pipeline **halts**. No model call. Fixed 999 card.
> "That's not the model being careful. Emergency detection is a deterministic rule list that runs *before* any Claude call — and it just refused to build a pathway. A Nature Medicine study in February found ChatGPT Health under-triaged 52% of real emergencies. We don't leave that to an LLM."

**2:25–2:40 — The artefact. Hold the printed page in your hand.**
> "One page. 'What I want to tell my doctor.' Three paragraphs the GP would spend six minutes extracting, five questions with coaching on how to ask them, and four things to chase afterwards with a script for each call — because 71% of people whose referral got lost only found out because they chased it themselves."

**2:40–2:55 — Architecture + who pays, in one breath.**
> "Claude for PDF vision, citations, structured outputs and a strict route enum; Supabase for storage, realtime, and row-level security so nobody but Maya can read her documents at the database layer. Twelve seeded cases, eleven right, and the one it got wrong is in the README. Juno subscription tier first, ICBs when we can show referral quality improves — Solace just hit a billion doing this with humans, and it bills the payer, not the patient."

**2:55–3:00 — Bookend. Then stop talking.**
> "Maya walks into her appointment on Thursday with one page instead of a shoebox. That's it. That's the product."

**Q&A — rehearse out loud:**
- *"Isn't this a symptom checker?"* → "A symptom checker guesses what's wrong and Healthily's explicitly excludes people with long-term conditions. We answer a different question: given what's already happened to you, what's missing from your record and how do you access the service you need."
- *"Is it a medical device?"* → the §6 line, verbatim.
- *"What if it hallucinates?"* → "Every event is page-cited or badged unverified, and the citation is a database constraint. Events referencing a fact that doesn't exist are dropped at the validation boundary."
- *"Why not just upload to ChatGPT?"* → the §3 answer.
- *"Isn't this a Juno feature?"* → "Juno owns self-reported longitudinal data. CarePath owns the institutional artefacts — discharge letters, labs, referrals — which self-logging can never produce. The engine runs standalone; Juno is the fastest route to the users who need it."

---

## 8. Hour-by-hour plan

30h from Sat 09:00. **A** = AI/backend, **B** = frontend, **C** = product/data/safety. Two-person fallback: A absorbs C's evals and red flags, B absorbs C's PDFs, eval drops to 6 cases.

**H-1 → H0 — accounts only, zero product code.** Supabase project (London/eu-west-2, **enable Anonymous Sign-Ins**), Vercel, Anthropic **commercial** key. Several sponsors count only work done during the event.

**H0–H1 — CONTRACT HOUR. All three in one room, no code split.** Write `contracts.ts` (zod: Fact, TimelineEvent, Gap, RouteSelection, Brief) and `fixtures.json` — a fully-populated hand-written example of the final output. Write the **intended-purpose statement** now.
> **✅ C0 @ H1 — `fixtures.json` typechecks against `contracts.ts`.** Everything is parallel from here.

**H1–H4**
- **A:** `scripts/spike.ts` — bare Node, no UI, no DB, no framework. Prove Pass A (PDF → citations with `page_location`) and Pass B (cited facts → json_schema) in isolation.
- **B:** app shell + all five panels rendering **purely from fixtures.json, zero network.**
- **C:** four synthetic PDFs — NHS-plausible letterheads, NHS number fields, consultant signature blocks, real-sounding trust names. **Print and rescan one** so it carries photocopier noise. Plus `nhs_routes.ts` and `red_flags.ts`. **Plant six known gaps in the dossier and write them down in a sealed ground-truth file.**
> **✅ C1 @ H4 — spike prints valid TimelineEvents with real page citations from a real PDF, AND the whole demo path is clickable on fixtures.** If the spike isn't green, cut the Citations API and ship page-number-only attribution — a 20-minute change now, a 3am rewrite later. **Freeze the route enum ids at H4 and never change them.**

**H4–H8**
- **A:** Files API upload, Pass A behind a Route Handler, **fixture recorder** (every model response written to `/fixtures/<sha256>.json`; `DEMO_MODE=fixtures` reads from disk).
- **B:** upload UI + Realtime streaming events into the timeline.
- **C:** 12-case eval set; unit tests on red flags including the negation guard.
> **✅ C2 @ H8 — one real PDF, uploaded live, renders a timeline with working citation chips.**

**H8–H12**
- **A:** Pass B + the drop/badge validation rules + **deterministic gap detectors** (referral with no outcome; "repeat in N weeks" with no later result; document referencing an absent document; medication with no review date).
- **B:** gap panel, citation hover → verbatim span, click → `#page=N`.
- **C:** run the eval. Record the number **including the failure**. Run the blind gap test against the sealed ground truth.
> **✅ C3 @ H12 — gap panel shows ≥3 real gaps on the demo dossier, ≥2 from deterministic detectors, 0 invented.**

**H12–H16**
- **A:** Pass C strict tool + red-flag pre-filter + `output_filter.ts`.
- **B:** route card rendering verbatim eligibility text; red-flag halt interstitial; permanent 999/111 panel.
- **C:** adversarial testing — triage bait, empty upload, corrupt PDF, prompt-injection text embedded inside a PDF.
> **🔥 C4 @ H16 — THE MONEY MOMENT WORKS.** Typing chest-pain text halts the pipeline in under 3 seconds with no model call. **Highest-value checkpoint in the build.**

**H16–H20**
- **A:** brief + coached questions + follow-up chase list (all extra fields on Pass B's schema — no new call).
- **B:** brief page, mandatory review checkbox, print stylesheet, one physical page.
- **C:** write the pitch as literal words (~400), time it.
> **✅ C5 @ H20 — cold start → printed brief in under 4 minutes, no database fiddling.**

**H20–H24 — hardening only, no new features.** Loading skeletons, error state on every generation, prompt-cache pre-warm endpoint, **audit the system prompt for `datetime.now()` / session UUIDs.** Grep every UI string for diagnostic language. Test on the actual projector resolution. **Physically turn the venue wifi off and run the full path.**
> **🔒 C6 @ H24 — DEMO FREEZE. Only permitted commits after this are copy strings and fixture data. No exceptions, no "quick fixes."**

**H24–H27 — submission artefacts.** README: architecture diagram with the MDCG module boundary drawn on it; explicit bulleted list of which Claude features you used and why (native PDF blocks, citations with `page_location`, structured outputs, strict tool use with evidence ids, adaptive thinking with summarized display) and which Supabase features (Storage, Realtime, RLS — **link the policy file**); setup steps verified from a clean clone by someone who didn't write them; the eval table. Public repo. **Record the 90-second backup video now, while wifi is fast.** The three compliance artefacts. Rehearse ×3.

**H27–H30 — zero code.** Rehearse ×2 more. Backup video loaded in a second browser tab. Re-warm the prompt cache every 4 minutes while queuing. Eat. Sleep if you can.

*The freeze will feel wasteful at H24 and correct at H29. Teams that rehearse consistently beat teams with better code and weaker storytelling. Protect it.*

---

## 9. Kill list

- **Authentication UI** — anonymous sign-in gives a real `auth.uid()` in 15 minutes; magic link scores zero.
- **Profile / onboarding wizard** — seed Maya's profile, conditions, meds, care team. Say "we've seeded her profile" and move on.
- **Consent flow** — one checkbox on landing, one boolean. Describe the granular per-category schema in the DPIA.
- **The extraction-review *gate*** — keep events editable and keep the unverified badge, but don't block the pipeline on approval. Costs 20 seconds of a 180-second demo and adds a failure point. The mandatory checkbox before *printing* is the one gate worth keeping.
- **Clarification loop** ("one question at a time") — a whole conversational surface for zero rubric points, and adaptive free-form chat is exactly what MHRA calls "high functionality."
- **ElevenLabs** — unconditionally, unless there is a named sponsor track. It earns nothing on the main rubric, breaks in noisy rooms, and a synthesised voice saying anything route-shaped is the easiest accidental route into device territory. Reclaims six hours.
- **PDF generation library** — `window.print()` with a print stylesheet is visually identical.
- **Post-appointment intake and outcome capture** — highest strategic value, near-zero demo value. Roadmap tile.
- **Multi-case management / "My CarePaths"** — one case.
- **pgvector / RAG** — theatre over four documents, and Supabase judges will notice.
- **`GP_SAME_DAY` as a selectable route** — that distinction is a seriousness judgement. Deliberate regulatory cut; say so.
- **Vercel AI SDK** — you need citations, Files API, strict tools and `effort`; one abstraction is debuggable at 3am, two are not.
- **Building the DB schema first** — five tables, not nine. Anti-pattern; it blocks everyone.
- **The word "triage"** and the words **"symptom checker"** — anywhere, ever. That category has visibly repriced (Doctorlink discontinued, Woebot shut June 2025, K Health down ~40% from peak, Healthily and Ada both retreated to B2B). Say navigation, signposting to published NHS eligibility criteria, appointment preparation.
- **The sentence "this is not a medical device"** — it is contestable as specced, a clinician judge will catch it, and the credibility loss is total. Use the §6 line instead.

---

## 10. The riskiest assumption

**Not the tech. Not the regulation. The assumption is: *a gap panel generated from four documents surfaces things that are both non-obvious and correct — and that a clinician would say changed how they'd run the appointment.***

Everything else in the build is de-risked by construction. The citation pipeline either works by H4 or you fall back to page-number attribution. The red-flag layer is a regex list and cannot fail. The route card is a lookup table. But the entire wedge — the reason CarePath isn't a ChatGPT wrapper — rests on the gap engine producing output that a clinician reads and says *"yes, I'd want to know that"* rather than *"that's trivially obvious"* or *"that's wrong."* If the gaps are obvious, you're a summariser. If they're wrong, you're dangerous. Nobody has validated this, and it is the one thing you cannot check by running the code.

**Cheapest test — two parts, ~55 minutes total, both done before H12:**

**Part one (45 min, H4–H12).** When C authors the four synthetic PDFs, they plant **six deliberate gaps** and write them into a sealed `evals/ground_truth_gaps.json` that A never sees. At H12, run the pipeline blind and score three numbers:
- **Recall** — how many of the six planted gaps did it find?
- **Precision** — how many gaps did it report that don't exist? *(Any non-zero number here is a five-alarm fire. A fabricated gap sends a patient to chase a document that was never ordered.)*
- **Non-obviousness** — of the gaps found, how many required cross-document reasoning (letter A references a document you don't hold) versus single-document reading?

That third number *is* the wedge, quantified. If it's zero, the gap panel is a summariser wearing a hat and you should reweight the demo toward the citation architecture and the follow-up chase list.

**Part two (10 min, any time Saturday).** This is a consumer health hackathon with clinician judges — there are clinicians in the building right now. Find one. Show them the gap panel for 90 seconds, on the printed brief, and ask exactly one question:

> **"If this patient handed you this page at the start of a ten-minute appointment, would any of these have changed how you ran it?"**

Ten minutes of walking around buys you the single most valuable sentence in your pitch — a named clinician's reaction to the hero feature — and it is the only test in this document that touches reality instead of your own fixtures. If the answer is no, you have twenty hours left to find out why, which is exactly the situation a hackathon is for.