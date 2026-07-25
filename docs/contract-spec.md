# Contract Spec — type this at hour 0, then freeze

**This file is the single source of truth every lane codes against.** It is not aspirational: at kickoff the orchestrator types these two files, commits them to `main`, and protects them. From that moment no agent may modify them without the orchestrator explicitly unfreezing.

**Why this matters.** Three agents building in parallel are only genuinely parallel if none of them waits for another. They achieve that by coding against *this contract* and against `fixtures.json` — never against each other's output. When Lane A finally lands real extraction, Lane B changes one import. If the contract drifts mid-build, that promise breaks and you get a 2am merge disaster.

**Order at hour 0 (30 minutes, orchestrator only):**
1. `lib/contracts.ts` — below
2. `supabase/migrations/0001_init.sql` — below
3. `fixtures/margaret.json` — hand-written, must typecheck against `lib/contracts.ts`
4. Commit to `main`, enable branch protection, push
5. Only then launch the lanes

---

## 1. `lib/contracts.ts`

```ts
import { z } from 'zod';

/* ---------- enums ---------- */

export const Provenance = z.enum([
  'user_stated',
  'document_extracted',
  'system_inferred',
  'unknown',
]);
export type Provenance = z.infer<typeof Provenance>;

/** 'juno_conversation' is a first-class source kind, not a special case.
 *  Juno entries become Claims with provenance 'user_stated' and flow through
 *  the identical pipeline — including participating in Conflicts. */
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

/** The 12 DST domains.
 *  VERIFIED against the NHS Continuing Healthcare Decision Support Tool
 *  (October 2022 guidance, accessible version, pp.59-61) — primary source.
 *  Official display names are in CHC_DOMAIN_NAMES; use them verbatim in any
 *  artefact, because an assessor reads the pack against the real form. */
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
 *  A ceiling cannot express the real scales: 'altered_consciousness' runs
 *  none → low → moderate → high → PRIORITY with **no Severe level at all**.
 *
 *  Three domains cap at High: continence, communication,
 *  psychological_emotional. Three reach Priority: breathing, behaviour,
 *  drug_therapies (plus altered_consciousness as noted).
 *
 *  Emitting a level absent from a domain's list means the pack contradicts
 *  the official form, which is exactly what a CHC-literate assessor or judge
 *  will notice first. Validate against this, never against a ceiling. */
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

/* ---------- core entities ---------- */

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
  quote: z.string(),
  locator: Locator,
  asserted_at: z.string().nullable(),
  date_precision: DatePrecision,
  provenance: Provenance,
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
  supporting_claim_ids: z.array(z.string().uuid()),
  conflict_id: z.string().uuid().nullable(),
});
export type Fact = z.infer<typeof Fact>;

export const Conflict = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  ontology_key: z.string(),
  subject: z.string(),
  claim_ids: z.array(z.string().uuid()).min(2),
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
  statement: z.string(),
  supporting_claim_ids: z.array(z.string().uuid()),
  suggested_next_document: z.string().nullable(),
});
export type Gap = z.infer<typeof Gap>;

/* ---------- templates ---------- */

export const Slot = z.object({
  key: z.string(),
  label: z.string(),
  ontology_match: z.array(z.string()),
  citation_required: z.boolean(),
  renderer: z.enum(['prose', 'list', 'table', 'conflict', 'quote']),
  gap_prompt: z.string().nullable(),
});
export type Slot = z.infer<typeof Slot>;

export const ArtifactTemplate = z.object({
  key: z.enum([
    'chc_dst_pack_v1',
    'gp_brief_v1',
    'discharge_pack_v1',
    'aa1_narrative_v1',
  ]),
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
  citation_verified: z.boolean(),
});
export type Assertion = z.infer<typeof Assertion>;

export const Artifact = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  template_key: ArtifactTemplate.shape.key,
  assertions: z.array(Assertion),
  user_verified: z.boolean(),
  created_at: z.string(),
});
export type Artifact = z.infer<typeof Artifact>;

/* ---------- the whole case: what fixtures.json contains ---------- */

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

/* ---------- extraction tool schema (Lane A forces this) ---------- */

export const EMIT_CLAIMS_TOOL = {
  name: 'emit_claims',
  description:
    'Emit the verbatim transcript of this source and every atomic claim it contains. ' +
    'Every claim MUST quote the source word for word.',
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
            ontology_key: { type: 'string' },
            subject: { type: 'string' },
            value: { type: 'string' },
            quote: {
              type: 'string',
              description:
                'VERBATIM substring of transcript. Copy exactly. Do not paraphrase, ' +
                'correct spelling, or expand abbreviations.',
            },
            page: { type: ['integer', 'null'] },
            asserted_at: { type: ['string', 'null'] },
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
```

### Forbidden fields — permanent

There is no `severity`, `rank`, `urgency`, `priority`, `risk`, `score`, or `eligible` field anywhere in this contract, at any nesting level, in any schema, now or later. **The model cannot express a clinical judgement because there is nowhere to put one.** This is the primary regulatory control. Any PR adding such a field is rejected regardless of how useful it looks.

---

## 2. `supabase/migrations/0001_init.sql`

```sql
create extension if not exists "pgcrypto";

create table people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  dob date,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table care_relationships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  member_id uuid not null,
  role text not null,                 -- 'self' | 'carer'
  access_basis text not null,
  declared_name text,
  granted_at timestamptz,
  revoked_at timestamptz
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  kind text not null,
  title text not null,
  storage_path text not null,
  transcript text not null default '',
  transcript_confidence real not null default 0,
  author_member_id uuid,
  created_at timestamptz not null default now()
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  ontology_key text not null,
  subject text not null,
  value text not null,
  quote text not null,
  locator jsonb not null,
  asserted_at date,
  date_precision text not null default 'unknown',
  provenance text not null,
  verified_substring boolean not null default false,
  created_at timestamptz not null default now()
);

-- Unverified claims must never be read by anything downstream.
create index claims_verified_idx on claims(person_id, ontology_key)
  where verified_substring = true;

create table facts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  ontology_key text not null,
  subject text not null,
  canonical_value text not null,
  provenance text not null,
  status text not null default 'confirmed',
  valid_from date,
  valid_to date,
  supporting_claim_ids uuid[] not null default '{}',
  conflict_id uuid,
  created_at timestamptz not null default now(),
  -- A fact may only lack supporting claims if it is explicitly unknown.
  constraint fact_needs_support
    check (status = 'unknown' or array_length(supporting_claim_ids, 1) >= 1)
);

create table claim_conflicts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  ontology_key text not null,
  subject text not null,
  claim_ids uuid[] not null,
  generated_question text not null,
  resolution text not null default 'unresolved',
  constraint conflict_needs_two check (array_length(claim_ids, 1) >= 2)
);

create table gaps (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  detector text not null,
  statement text not null,
  supporting_claim_ids uuid[] not null default '{}',
  suggested_next_document text
);

create table artifact_templates (
  key text primary key,
  title text not null,
  audience text not null,
  sections jsonb not null
);

create table artifacts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  template_key text not null references artifact_templates(key),
  user_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table assertions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts(id) on delete cascade,
  slot_key text not null,
  text text not null,
  fact_ids uuid[] not null default '{}',
  citation_verified boolean not null default false,
  -- Citation integrity as a database impossibility, not a convention.
  constraint citation_requires_facts
    check (citation_verified = false or array_length(fact_ids, 1) >= 1)
);

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  member_id uuid not null,
  basis text not null,
  declared_name text not null,
  accepted_at timestamptz not null default now()
);

/* ---------- RLS: one policy serves carer and self ---------- */

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

alter table people             enable row level security;
alter table care_relationships enable row level security;
alter table sources            enable row level security;
alter table claims             enable row level security;
alter table facts              enable row level security;
alter table claim_conflicts    enable row level security;
alter table gaps               enable row level security;
alter table artifacts          enable row level security;
alter table consent_records    enable row level security;

create policy p_people   on people   using (has_care_access(id));
create policy p_sources  on sources  using (has_care_access(person_id));
create policy p_claims   on claims   using (has_care_access(person_id));
create policy p_facts    on facts    using (has_care_access(person_id));
create policy p_conf     on claim_conflicts using (has_care_access(person_id));
create policy p_gaps     on gaps     using (has_care_access(person_id));
create policy p_art      on artifacts using (has_care_access(person_id));
create policy p_consent  on consent_records using (has_care_access(person_id));
create policy p_rel      on care_relationships using (member_id = auth.uid());

-- artifact_templates is reference data, readable by all authenticated users
alter table artifact_templates enable row level security;
create policy p_templates on artifact_templates for select using (true);
```

---

## 3. `fixtures/margaret.json`

Hand-written at hour 0 by the orchestrator. It is a complete, realistic `CaseSnapshot` — four sources, ~30 claims, ~20 facts, one furosemide conflict with three claim ids, three gaps, and both artefacts fully rendered.

**This file is what makes the build parallel.** Lane B builds every screen against it with no network, no database, and no API key. Lane C tests detectors against it. Lane D uses it as the `replay` payload.

It must satisfy exactly one test, which runs in CI:

```ts
import { CaseSnapshot } from '@/lib/contracts';
import fixture from '@/fixtures/margaret.json';

test('fixture conforms to contract', () => {
  expect(() => CaseSnapshot.parse(fixture)).not.toThrow();
});
```

If that test is red, **nothing else can be trusted** — every lane is building against a lie. It is the first thing the integrator checks in every merge window.

---

## 3b. `fixtures/templates.json`

The two phase-1 `ArtifactTemplate` rows: `chc_dst_pack_v1` (31 slots across 12 DST domains plus cover and method) and `gp_brief_v1` (8 slots).

**This file is the proof that templates are data, not code.** Both lanes read it: Lane A to know what to fill, Lane B to know what to lay out. Without it they would each invent their own slot lists and diverge — exactly the failure the contract exists to prevent.

Validated by `lib/__tests__/templates.test.ts`, whose most important assertion is the **cross-check**: every `slot_key` used by an artefact in `margaret.json` must exist in its template. Without that test, Lane A can fill slots Lane B never renders and neither notices until integration.

Also enforced there:

- All twelve DST domains present, with section titles matching `CHC_DOMAIN_NAMES` **exactly** — an assessor reads the pack against the real form
- Slot keys unique within a template
- Every citation-required slot has a `gap_prompt`, so an unfillable slot degrades to an honest prompt rather than blank space
- No slot key smuggles in a judgement field
- Every `suggested_level` slot's label says *suggested, not determined*, and the three High-capped domains plus altered states say so in their labels

**Adding a third gatekeeper (phase 2) should be a new object in this file plus a renderer.** If it needs pipeline changes, the abstraction has failed — see Lane A's brief.

Lane D seeds `artifact_templates` from this file. Nobody hand-writes template SQL.

---

## 4. Changing the contract after freeze

It will need to change. Handle it deliberately:

1. An agent that believes the contract is wrong **stops** and writes the problem into its PR description. It does not edit `lib/contracts.ts`.
2. The orchestrator decides.
3. If changed: orchestrator edits it on `main`, updates `fixtures/margaret.json` in the same commit, and tells every lane to rebase.
4. Never during the night shift. A contract change while you're asleep desynchronises every lane at once.
