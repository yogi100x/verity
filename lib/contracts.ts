/**
 * VERITY — THE CONTRACT
 *
 * Frozen at hour 0. Every lane codes against this file and against
 * fixtures/margaret.json. No lane codes against another lane's output.
 *
 * DO NOT EDIT without the orchestrator. If you believe something here is
 * wrong, write it in your PR description and stop.
 *
 * There is no severity / rank / urgency / priority / risk / score field
 * anywhere in this file, at any nesting level, now or ever. The model cannot
 * express a clinical judgement because there is nowhere to put one. This is
 * the primary regulatory control and it is structural, not advisory.
 */

import { z } from 'zod';

/* ============================ enums ============================ */

export const Provenance = z.enum([
  'user_stated',
  'document_extracted',
  'system_inferred',
  'unknown',
]);
export type Provenance = z.infer<typeof Provenance>;

/** 'juno_conversation' is first-class, not a special case. Juno entries become
 *  Claims with provenance 'user_stated' and flow through the identical
 *  pipeline — including participating in Conflicts. */
export const SourceKind = z.enum([
  'pdf',
  'image',
  'audio',
  'text',
  'juno_conversation',
]);
export type SourceKind = z.infer<typeof SourceKind>;

export const DatePrecision = z.enum([
  'exact',
  'month',
  'year',
  'approximate',
  'unknown',
]);
export type DatePrecision = z.infer<typeof DatePrecision>;

export const AccessBasis = z.enum([
  'self',
  'person_consent',
  'lpa_health_welfare',
  'court_deputy',
  'best_interests_declared',
]);
export type AccessBasis = z.infer<typeof AccessBasis>;

/* ======================= CHC domains ===========================
 * VERIFIED against the NHS Continuing Healthcare Decision Support Tool
 * (October 2022 guidance, accessible version, pp.59-61) — primary source.
 * Three domain ceilings were wrong before verification. Do not "correct" these.
 */

export const ChcDomain = z.enum([
  'breathing',
  'nutrition',
  'continence',
  'skin_integrity',
  'mobility',
  'communication',
  'psychological_emotional',
  'cognition',
  'behaviour',
  'drug_therapies',
  'altered_consciousness',
  'other_significant',
]);
export type ChcDomain = z.infer<typeof ChcDomain>;

/** Official display names. Use verbatim in any artefact — an assessor reads
 *  the pack against the real form. Never hand-type a domain heading. */
export const CHC_DOMAIN_NAMES: Record<ChcDomain, string> = {
  breathing: 'Breathing',
  nutrition: 'Nutrition – food and drink',
  continence: 'Continence',
  skin_integrity: 'Skin (including tissue viability)',
  mobility: 'Mobility',
  communication: 'Communication',
  psychological_emotional: 'Psychological and emotional needs',
  cognition: 'Cognition',
  behaviour: 'Behaviour',
  drug_therapies: 'Drug therapies and medication',
  altered_consciousness: 'Altered states of consciousness',
  other_significant: 'Other significant care needs',
};

export const ChcLevel = z.enum([
  'none',
  'low',
  'moderate',
  'high',
  'severe',
  'priority',
]);
export type ChcLevel = z.infer<typeof ChcLevel>;

/** Levels ACTUALLY AVAILABLE per domain — not a ceiling.
 *
 *  A ceiling cannot express the real scales: altered_consciousness runs
 *  none -> low -> moderate -> high -> PRIORITY with no Severe level at all.
 *
 *  Three domains cap at High: continence, communication,
 *  psychological_emotional. Emitting a level absent from a domain's list means
 *  the pack contradicts the official form — the first thing a CHC-literate
 *  assessor notices. Validate against this, never against a ceiling. */
export const CHC_DOMAIN_LEVELS: Record<ChcDomain, readonly ChcLevel[]> = {
  breathing:               ['none', 'low', 'moderate', 'high', 'severe', 'priority'],
  nutrition:               ['none', 'low', 'moderate', 'high', 'severe'],
  continence:              ['none', 'low', 'moderate', 'high'],
  skin_integrity:          ['none', 'low', 'moderate', 'high', 'severe'],
  mobility:                ['none', 'low', 'moderate', 'high', 'severe'],
  communication:           ['none', 'low', 'moderate', 'high'],
  psychological_emotional: ['none', 'low', 'moderate', 'high'],
  cognition:               ['none', 'low', 'moderate', 'high', 'severe'],
  behaviour:               ['none', 'low', 'moderate', 'high', 'severe', 'priority'],
  drug_therapies:          ['none', 'low', 'moderate', 'high', 'severe', 'priority'],
  altered_consciousness:   ['none', 'low', 'moderate', 'high', 'priority'],
  other_significant:       ['none', 'low', 'moderate', 'high', 'severe'],
} as const;

export function isValidLevel(domain: ChcDomain, level: ChcLevel): boolean {
  return CHC_DOMAIN_LEVELS[domain].includes(level);
}

/* ========================= entities ============================ */

export const Locator = z.object({
  page: z.number().int().nullable(),
  char_start: z.number().int().nullable(),
  char_end: z.number().int().nullable(),
  ms_start: z.number().int().nullable(),
  ms_end: z.number().int().nullable(),
});
export type Locator = z.infer<typeof Locator>;

export const Source = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  kind: SourceKind,
  title: z.string(),
  storage_path: z.string(),
  transcript: z.string(),
  transcript_confidence: z.number().min(0).max(1),
  author_member_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type Source = z.infer<typeof Source>;

export const Claim = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  ontology_key: z.string(),
  subject: z.string(),
  value: z.string(),
  /** VERBATIM from the source. Verified as a literal substring of
   *  source.transcript or the claim is dropped. */
  quote: z.string(),
  locator: Locator,
  asserted_at: z.string().nullable(),
  date_precision: DatePrecision,
  provenance: Provenance,
  /** false => dropped. Never surfaced, never retried, never stored as true. */
  verified_substring: z.boolean(),
});
export type Claim = z.infer<typeof Claim>;

export const Fact = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  ontology_key: z.string(),
  subject: z.string(),
  canonical_value: z.string(),
  provenance: Provenance,
  status: z.enum(['confirmed', 'disputed', 'unknown']),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
  /** Empty ONLY when status === 'unknown'. Enforced in the DB too. */
  supporting_claim_ids: z.array(z.string().uuid()),
  conflict_id: z.string().uuid().nullable(),
  /** Set by the supersession pass (stretch S6). The fact that replaced this
   *  one. Superseded facts stay visible and keep their citations. */
  superseded_by: z.string().uuid().nullable().default(null),
});
export type Fact = z.infer<typeof Fact>;

export const Conflict = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  ontology_key: z.string(),
  subject: z.string(),
  claim_ids: z.array(z.string().uuid()).min(2),
  /** States what the documents say and asks something a clinician can answer.
   *  Never asserts a need, never implies urgency. */
  generated_question: z.string(),
  resolution: z.enum(['unresolved', 'user_resolved']),
});
export type Conflict = z.infer<typeof Conflict>;

export const GapDetector = z.enum([
  'instruction_without_result',
  'referral_without_outcome',
  'review_date_passed',
  'referenced_document_absent',
  'medication_without_review',
  'domain_evidence_thin',
]);
export type GapDetector = z.infer<typeof GapDetector>;

export const Gap = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  detector: GapDetector,
  /** A statement about the RECORD. Never advice. */
  statement: z.string(),
  supporting_claim_ids: z.array(z.string().uuid()),
  suggested_next_document: z.string().nullable(),
});
export type Gap = z.infer<typeof Gap>;

/* ======================== templates ============================ */

export const Slot = z.object({
  key: z.string(),
  label: z.string(),
  ontology_match: z.array(z.string()),
  citation_required: z.boolean(),
  renderer: z.enum(['prose', 'list', 'table', 'conflict', 'quote']),
  /** Shown when the slot cannot be filled. NEVER fabricated prose. */
  gap_prompt: z.string().nullable(),
});
export type Slot = z.infer<typeof Slot>;

export const TemplateKey = z.enum([
  'chc_dst_pack_v1',
  'gp_brief_v1',
  'discharge_pack_v1',
  'aa1_narrative_v1',
]);
export type TemplateKey = z.infer<typeof TemplateKey>;

export const ArtifactTemplate = z.object({
  key: TemplateKey,
  title: z.string(),
  audience: z.string(),
  sections: z.array(
    z.object({ key: z.string(), title: z.string(), slots: z.array(Slot) }),
  ),
});
export type ArtifactTemplate = z.infer<typeof ArtifactTemplate>;

export const Assertion = z.object({
  id: z.string().uuid(),
  artifact_id: z.string().uuid(),
  slot_key: z.string(),
  text: z.string(),
  fact_ids: z.array(z.string().uuid()),
  /** Cannot be true with an empty fact_ids. DB constraint enforces it. */
  citation_verified: z.boolean(),
});
export type Assertion = z.infer<typeof Assertion>;

export const Artifact = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  template_key: TemplateKey,
  assertions: z.array(Assertion),
  user_verified: z.boolean(),
  created_at: z.string(),
});
export type Artifact = z.infer<typeof Artifact>;

/* ================== the whole case (fixtures) ================== */

export const CaseSnapshot = z.object({
  person: z.object({
    id: z.string().uuid(),
    display_name: z.string(),
    access_basis: AccessBasis,
  }),
  sources: z.array(Source),
  claims: z.array(Claim),
  facts: z.array(Fact),
  conflicts: z.array(Conflict),
  gaps: z.array(Gap),
  artifacts: z.array(Artifact),
  stats: z.object({
    claims_extracted: z.number().int(),
    claims_dropped: z.number().int(),
  }),
});
export type CaseSnapshot = z.infer<typeof CaseSnapshot>;

/* ============ extraction tool schema (Lane A forces this) ============
 * Citations API and output_config.format are INCOMPATIBLE (returns 400).
 * Extraction is forced strict tool use plus our own substring check.
 */

export const EMIT_CLAIMS_TOOL = {
  name: 'emit_claims',
  description:
    'Emit the verbatim transcript of this source and every atomic claim it ' +
    'contains. Every claim MUST quote the source word for word.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['transcript', 'claims'],
    properties: {
      transcript: {
        type: 'string',
        description: 'Best-effort verbatim text of the entire source.',
      },
      claims: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'ontology_key',
            'subject',
            'value',
            'quote',
            'page',
            'asserted_at',
            'date_precision',
          ],
          properties: {
            ontology_key: {
              type: 'string',
              description:
                'Dotted key, e.g. medication.furosemide, instruction.renal_review, ' +
                'observation.mobility, chc.drug_therapies',
            },
            subject: {
              type: 'string',
              description: 'Normalised subject, e.g. furosemide',
            },
            value: { type: 'string' },
            quote: {
              type: 'string',
              description:
                'VERBATIM substring of transcript. Copy exactly. Do not paraphrase, ' +
                'correct spelling, expand abbreviations, or fix punctuation.',
            },
            page: { type: ['integer', 'null'] },
            asserted_at: {
              type: ['string', 'null'],
              description: 'ISO date or null',
            },
            date_precision: {
              type: 'string',
              enum: ['exact', 'month', 'year', 'approximate', 'unknown'],
            },
          },
        },
      },
    },
  },
} as const;
