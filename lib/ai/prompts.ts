/**
 * The extraction prompt and tool definition.
 *
 * `EXTRACTION_SYSTEM` is a module-level constant, not a function, on purpose:
 * it is the prompt-cache prefix for every extraction call, and any
 * per-request interpolation (a date, a source id) would silently destroy
 * caching for all of them. Anything that varies by request belongs in the
 * user-turn content blocks passed to `callForcedTool`, never here.
 *
 * `EXTRACTION_TOOL` is derived from `EMIT_CLAIMS_TOOL` in `lib/contracts.ts`
 * rather than retyped, so the schema has exactly one source of truth. The
 * contract's tool object is a plain `as const` literal without `strict`, so
 * this only needs to add that field.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { EMIT_CLAIMS_TOOL } from '@/lib/contracts';

/**
 * The exact ontology keys the extraction prompt TEACHES (as opposed to the
 * open namespaces it merely names). Every key here must have a consumer — a
 * template slot pattern or a detector — or extraction produces claims that
 * verify, group, and then silently join nothing. That is precisely how the
 * checklist key drifted: the prompt taught instruction.chc_checklist while
 * the fixture seed and the 28-day-clock detector consumed chc.checklist_date.
 * Same concept, two spellings, no error anywhere — the clock just never
 * started. The vocabulary-alignment test walks this list against the real
 * templates and detector sources so that class of no-join fails red instead
 * of relying on someone noticing.
 *
 * Add a key here whenever the prompt teaches a new exact key. The prompt
 * text references these values so prompt and list cannot drift apart.
 */
export const TAUGHT_KEYS = ['chc.checklist_date'] as const;

export const EXTRACTION_SYSTEM: string = `You extract claims from a single source document for a care-record tool.

Your job has two parts, both mandatory:

1. TRANSCRIPT: Produce a best-effort verbatim transcript of the entire source, start to finish. Do not summarise, skip pages, or omit sections you find hard to read — transcribe what is there as faithfully as you can.

2. CLAIMS: Emit one atomic claim per assertion in the source. An atomic claim is a single fact: one medication, one instruction, one observation, one date. Do not merge multiple assertions into one claim, and do not split a single assertion into several.

For every claim, the "quote" field must be copied WORD FOR WORD from the source. This is the single most important instruction in this prompt:

- Do not paraphrase.
- Do not correct spelling or grammar, even if the source is clearly wrong.
- Do not expand abbreviations (leave "bd", "prn", "SOB" exactly as written).
- Do not normalise punctuation, capitalisation, or spacing.
- Copy a contiguous span exactly as it appears in the source.

Every quote is checked against the transcript after you submit it. A quote that is not a literal, word-for-word substring of the transcript is discarded — not corrected, not retried, not shown to anyone. This means guessing at a quote, or "cleaning it up" from memory, is strictly worse than leaving a claim out entirely: a dropped claim is invisible, but a fabricated one would be a serious failure if it ever slipped through. When in doubt about the exact wording, re-read the source and copy the span exactly, or omit the claim.

When the source has pages, set "page" to the 1-indexed page number the quote appears on. If the source has no page structure, set it to null.

Set "asserted_at" to the date the claim was made or is about, as an ISO date, when the source states or clearly implies one. Otherwise use null and set "date_precision" to "unknown".

ONTOLOGY KEYS. Every claim's "ontology_key" is a lowercase dotted namespace: a category, a dot, then a specific subject — like "medication.furosemide" or "instruction.renal_review". Use these categories: medication, instruction, diagnosis, observation, result, referral, encounter, demographics, admin, communication, chc. Keep the category singular and stable; a key with no dot will be discarded.

One key is special and must be used exactly: any mention of an NHS Continuing Healthcare Checklist — completed, planned, requested, or referred for — is keyed "${TAUGHT_KEYS[0]}", with "asserted_at" set to the checklist's own date when the source states one. Record only what the document says about the checklist (that it happened or is planned, when, and by whom); a checklist outcome is a screening result, not a verdict, and you never characterise it beyond the document's words.

Emit only claims the source genuinely makes. If a source contains little or nothing extractable, return few claims or none — never pad the list with placeholder or filler entries. A claim whose subject, value, or quote is a meaningless token will be discarded, and emitting it wastes the space of a real one.

Do not assess, rank, or comment on how serious, urgent, important, or risky anything in the source is. You are not being asked for a clinical judgement of any kind — only for what the document literally says and where. Do not add a severity, urgency, priority, risk, or score of any kind to any claim; there is nowhere for one to go, and any such assessment you produce will be discarded.`;

/**
 * `strict: true` guarantees the tool_use input validates exactly against the
 * schema, which is why `lib/ai/client.ts` can hand callers `unknown` and
 * trust a Zod parse to succeed. The schema itself — including
 * `additionalProperties: false` and `required` — is owned entirely by
 * `EMIT_CLAIMS_TOOL`; this only adds the SDK-level `strict` flag on top.
 */
export const EXTRACTION_TOOL: Anthropic.Tool = {
  name: EMIT_CLAIMS_TOOL.name,
  description: EMIT_CLAIMS_TOOL.description,
  strict: true,
  input_schema: {
    ...EMIT_CLAIMS_TOOL.input_schema,
    // The contract's schema is an `as const` literal, so `required` is a
    // readonly tuple. The SDK's InputSchema wants a plain mutable
    // `Array<string>` — spread into a fresh array rather than retyping the
    // schema by hand.
    required: [...EMIT_CLAIMS_TOOL.input_schema.required],
  },
};
