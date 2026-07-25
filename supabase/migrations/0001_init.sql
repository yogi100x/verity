-- VERITY 0001_init
-- Run once at hour 0. Additive migrations only after this (0002+, Lane A).
--
-- Two constraints below are load-bearing, not hygiene:
--   fact_needs_support     - a fact cannot exist without evidence
--   citation_requires_facts - citation integrity as a database impossibility

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
  role text not null,                     -- 'self' | 'carer'
  access_basis text not null,             -- see AccessBasis in lib/contracts.ts
  declared_name text,                     -- typed full name, never a checkbox
  granted_at timestamptz,
  revoked_at timestamptz
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  kind text not null,                     -- pdf|image|audio|text|juno_conversation
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
  quote text not null,                    -- VERBATIM from source
  locator jsonb not null,
  asserted_at date,
  date_precision text not null default 'unknown',
  provenance text not null,
  verified_substring boolean not null default false,
  created_at timestamptz not null default now()
);

-- Downstream reads only ever touch verified claims.
create index claims_verified_idx on claims(person_id, ontology_key)
  where verified_substring = true;
create index claims_source_idx on claims(source_id);

create table facts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  ontology_key text not null,
  subject text not null,
  canonical_value text not null,
  provenance text not null,
  status text not null default 'confirmed',   -- confirmed|disputed|unknown
  valid_from date,
  valid_to date,
  supporting_claim_ids uuid[] not null default '{}',
  conflict_id uuid,
  superseded_by uuid references facts(id),
  created_at timestamptz not null default now(),
  -- A fact may only lack supporting claims if it is explicitly unknown.
  constraint fact_needs_support
    check (status = 'unknown' or array_length(supporting_claim_ids, 1) >= 1)
);

create index facts_person_key_idx on facts(person_id, ontology_key);

create table claim_conflicts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  ontology_key text not null,
  subject text not null,
  claim_ids uuid[] not null,
  generated_question text not null,
  resolution text not null default 'unresolved',
  created_at timestamptz not null default now(),
  constraint conflict_needs_two check (array_length(claim_ids, 1) >= 2)
);

create table gaps (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  detector text not null,
  statement text not null,                -- about the RECORD, never advice
  supporting_claim_ids uuid[] not null default '{}',
  suggested_next_document text,
  created_at timestamptz not null default now()
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

-- ============ RLS: one policy serves carer and self ============
-- Self-serve is the degenerate carer case: a care_relationships row where
-- member_id = the person's own auth uid, role = 'self'. No engine fork.

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
alter table artifact_templates enable row level security;

create policy p_people   on people            using (has_care_access(id));
create policy p_rel      on care_relationships using (member_id = auth.uid());
create policy p_sources  on sources           using (has_care_access(person_id));
create policy p_claims   on claims            using (has_care_access(person_id));
create policy p_facts    on facts             using (has_care_access(person_id));
create policy p_conf     on claim_conflicts   using (has_care_access(person_id));
create policy p_gaps     on gaps              using (has_care_access(person_id));
create policy p_art      on artifacts         using (has_care_access(person_id));
create policy p_consent  on consent_records   using (has_care_access(person_id));

-- Reference data: readable by anyone authenticated.
create policy p_templates on artifact_templates for select using (true);

-- assertions inherit access through their artifact
alter table assertions enable row level security;
create policy p_assert on assertions using (
  exists (select 1 from artifacts a
          where a.id = assertions.artifact_id
            and has_care_access(a.person_id))
);
