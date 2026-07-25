# Lane A — Pipeline

**Paste this whole file into the agent on machine A at kickoff.**

**Read first:** `prd.md`, `docs/contract-spec.md`, `docs/stack-freeze.md`.

**The stack is frozen.** Do not install any dependency. If you think you need one, write it in your PR description — do not run `pnpm add`. Note especially: pgvector and RAG are rejected with reasons, and the Anthropic SDK is used raw, not through the Vercel AI SDK. Do not start until `pnpm test` is green on the fixture-conforms-to-contract test.

**Branch:** `lane/a`. **Territory:** `lib/ai/**`, `app/api/**`, `supabase/migrations/000[2-9]_*.sql` (additive only).
**Never touch:** `lib/contracts.ts`, `fixtures/**`, `components/**`, `app/(app)/**`, `lib/safety/**`.

---

## Objective

Turn a pile of documents into a citation-anchored claim set, reconcile it into facts, surface disagreements, and render artefacts — such that **no assertion can reach a user without a verbatim quote behind it**.

The product's entire credibility rests on that invariant. When you face a tradeoff between capability and the invariant, the invariant wins every time. A missing claim is a bug. A fabricated one is a catastrophe.

The demo beat you personally own: **three sources disagreeing about furosemide produce a conflict with a generated question.** If nothing else in this lane works, that must.

---

## Spec

### Models

| Step | Model | Notes |
|---|---|---|
| Extraction (per source, parallel) | `claude-sonnet-5`, `output_config: {effort:'low'}` | Native PDF/image blocks, forced strict tool use |
| Grouping assist (unmatched subjects only) | `claude-sonnet-5`, effort `low` | One batched call |
| Gap semantic pass | `claude-sonnet-5`, effort `medium` | One batched call over facts |
| Date resolution | `claude-haiku-4-5` | **Haiku uses `budget_tokens`, not `effort`** |
| Artefact generation | `claude-sonnet-5`, effort `medium` | `claude-opus-5` behind a flag, prose only |

**API rules that will cost you an hour if ignored:**
- Citations API and `output_config.format` are **incompatible** — returns 400. Use forced strict tool use plus our own substring check.
- `thinking: {type:'enabled', budget_tokens:N}` returns 400 on Sonnet 5. Use `{type:'adaptive'}` + `output_config.effort`.
- Non-default `temperature`/`top_p`/`top_k` return 400 on Sonnet 5. Omit them.
- Assistant-turn prefills return 400. Use structured outputs.

### Extraction

One call per `Source`. Force `EMIT_CLAIMS_TOOL` (in `docs/contract-spec.md`). The model returns a verbatim `transcript` plus `claims[]`, each carrying a `quote` copied word for word.

No OCR pipeline. Native PDF and image content blocks. Client pre-upload: EXIF auto-rotate and downscale to <5MB. Never crop or deskew — it destroys the page coordinates the citation depends on.

If claim count is near zero or substring failures exceed ~40%, retry once with a contrast-boosted variant. If still bad, surface an honest state naming what could not be read. **Never silently return nothing.**

### The substring kill switch — the most important function in the codebase

```ts
// lib/ai/verify.ts
export function normalise(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/­/g, '')          // soft hyphen
    .replace(/-\s*\n\s*/g, '')       // hyphenation across line breaks
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function verifyClaim(claim: Claim, source: Source): boolean {
  return normalise(source.transcript).includes(normalise(claim.quote));
}
```

False ⇒ `verified_substring = false` ⇒ **dropped**. Not flagged, not retried, not shown. Return the drop count so the UI can display it.

Normalise whitespace, smart quotes, soft hyphens and line-break hyphenation — **and nothing else**. Every additional normalisation is a hole in the guarantee.

### Grouping and conflicts

Deterministic first. Normalise `subject` (lowercase, strip dose/form, map known synonyms — `water tablet` → `furosemide`) and group by `ontology_key` + normalised subject. Only unmatched subjects go to the model, and it may only *suggest a grouping* — never invent a claim.

Two or more live claims with the same key and incompatible values ⇒ a `Conflict` row with all claim ids and a `generated_question`.

The question states what the documents say and asks something a clinician can answer. *"Three sources disagree about the water tablet (furosemide). Ask whether it should have been restarted."* Never *"she should restart it."*

**Conflicts are never auto-resolved.** No confidence ranking, no "most recent wins."

### Artefacts

**The templates already exist — do not invent slots.** Read them from `fixtures/templates.json`: `chc_dst_pack_v1` (31 slots, 12 DST domains plus cover and method) and `gp_brief_v1` (8 slots). Lane B renders the same file, so any slot you invent is a slot nobody displays.

Render `Fact`s through an `ArtifactTemplate` row. A slot resolves only to facts backed by at least one claim with `verified_substring = true`; otherwise it falls through to `gap_prompt`. **Never to generated prose.**

Match facts to slots on `ontology_match`, which supports a trailing wildcard (`medication.*`). Domain headings come from `CHC_DOMAIN_NAMES` via the template's section title — never hand-typed.

If you need a slot that does not exist, that is a template change: say so in your PR. Do not add it yourself.

`gp_brief_v1` must cost you a **seed row plus a renderer, not new pipeline code**. If it doesn't, the abstraction has failed and the central pitch claim is false — stop and say so in your PR.

---

## Tests — write these before the code

1. `verifyClaim` returns false for a paraphrase, a corrected spelling, an expanded abbreviation
2. `verifyClaim` returns true across smart quotes, doubled whitespace, and a hyphen split over a line break
3. A fabricated quote never appears in any API response — assert on the endpoint output, not the helper
4. Fixture claims all pass verification
5. `water tablet` and `Furosemide 40mg` group to the same subject
6. Three furosemide claims with incompatible values produce exactly one Conflict with three claim ids
7. A conflict's `generated_question` contains no banned term (import Lane C's list; if absent, inline a TODO)
8. Both templates render from the same fixture Fact set and produce different sections
9. A slot with no backing fact renders its `gap_prompt`, never invented text
10. **No response object anywhere contains a key matching `/severity|urgency|priority|rank|risk|score/i`**

---

## Visual proof — required, you have no UI

Build `/api/debug/inspect` returning HTML: every source, its claims, each with quote, locator, and pass/fail on verification; dropped claims in a separate section. The orchestrator cannot read code and must be able to *see* your lane working.

---

## Night-shift backlog (independent, safe to run unattended)

1. Prompt-cache the extraction system prompt; verify with `usage.cache_read_input_tokens`
2. Retry-and-repair on schema validation failure
3. Date normalisation for "a few months ago", "last winter", "before the operation" — with explicit `date_precision`
4. Batch extraction concurrency with a sane cap
5. Cost and latency logging per step to `generation_logs`

---

## Stretch goals — do not start before H16, and only if Journey 1 is fully green

See `docs/implementation-plan.md` §7b for the full table and ordering.

### S6 — Supersession (2h)

Margaret's March cardiology letter says *continue furosemide*. The June discharge says *stopped*. Both are true; they were true at different times.

When two facts share an `ontology_key` and subject but have non-overlapping validity, mark the earlier one superseded: set its `valid_to` to the later fact's `valid_from`, and record which fact replaced it. **Never delete the earlier fact** — it stays visible, struck through, with its citation intact. Lane B renders it.

A superseded fact must not populate a "current state" slot in any artefact.

### S7 — Third artefact template: discharge pack (3h)

Add `discharge_pack_v1`: what changed, the reconciled medication picture, what to watch for, and who owes a follow-up.

**This is a design test as much as a feature.** It must cost you a seed row plus a renderer. If it needs pipeline changes, the `ArtifactTemplate`-as-data abstraction has failed and the pitch claim *"adding a gatekeeper is seed data"* is false. **Stop, write that in the PR, and revert.** Discovering it is more valuable than shipping it.

### S8 — Voice webhook (2h, only if Lane E is not running)

`POST /api/voice/inbound` returns TwiML; `POST /api/voice/recording` stores the recording and creates a `Source`. Details in `docs/lanes/lane-e-voice.md` rung 2 — read the three gotchas there before writing anything.

### Stretch tests

- A superseded fact has `valid_to` set and is excluded from current-state slots
- The superseding fact is identifiable from the superseded one
- Both facts remain queryable with citations intact
- `discharge_pack_v1` renders from the same Fact set as the other two templates
- Adding the third template touches **zero** files in `lib/ai/extract*`, `lib/ai/group*`, or `lib/ai/verify*`

---

## Stop and ask, do not guess

- The contract seems wrong → write it in the PR, do not edit `lib/contracts.ts`
- A safety rule blocks a feature → the safety rule wins; note it
- A template needs a new field → stop; that's a contract change

## PR checklist

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] New behaviour has a test that fails without the change
- [ ] Preview deploys; `/api/debug/inspect` renders
- [ ] No file outside territory touched
- [ ] Description written for a non-coder: what changed, what to click, what correct looks like, which journey steps should now pass
