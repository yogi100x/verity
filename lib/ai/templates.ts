/**
 * Templates are data, not code.
 *
 * This file's only job is to load `fixtures/templates.json`, validate it
 * against the frozen `ArtifactTemplate` zod schema so a malformed template
 * fails loudly at load rather than silently at render, and offer the two
 * small lookups every renderer needs: "give me a template by key" and
 * "flatten a template into its slots, each carrying the section it lives
 * in". Nothing here knows what a slot key or section key IS — that
 * knowledge lives entirely in `fixtures/templates.json` and
 * `lib/contracts.ts` (`CHC_DOMAIN_NAMES`), never in this file.
 */

import { z } from 'zod';
import templatesJson from '@/fixtures/templates.json';
import {
  ArtifactTemplate,
  ChcDomain,
  ChcLevel,
  CHC_DOMAIN_LEVELS,
  type Slot,
} from '@/lib/contracts';
import { BANNED_ARTEFACT_TITLES } from '@/lib/copy/safety';

const Templates = z.array(ArtifactTemplate);

let cachedTemplates: ArtifactTemplate[] | null = null;

/** A loaded template's title matches one of `BANNED_ARTEFACT_TITLES` — a real
 *  safety rule (this product organises evidence; it must never present
 *  itself as a clinical document) that nothing previously enforced. Word-
 *  boundary, case-insensitive substring: "SBAR Referral Pack" is caught, not
 *  only an exact "SBAR". Thrown at load, alongside the zod parse, so a bad
 *  title fails loudly rather than shipping. */
export class BannedArtefactTitleError extends Error {
  constructor(templateKey: string, title: string, matched: string) {
    super(
      `template "${templateKey}" has a banned artefact title "${title}" (matches "${matched}")`,
    );
    this.name = 'BannedArtefactTitleError';
  }
}

function assertTitleNotBanned(template: ArtifactTemplate): void {
  for (const banned of BANNED_ARTEFACT_TITLES) {
    const pattern = new RegExp(`\\b${banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(template.title)) {
      throw new BannedArtefactTitleError(template.key, template.title, banned);
    }
  }
}

/**
 * A slot whose key's final segment is `suggested_level` — so it holds a
 * controlled CHC level, by the convention `levelSlotDomain` reads — but whose
 * prefix is not a `ChcDomain`, so `levelSlotDomain` returns `null` and the
 * level gate in `resolveSlot` is SILENTLY OFF for it.
 *
 * This is the failure mode the TODO on `levelSlotDomain` names, made loud. The
 * gate is inferred from a key convention because `Slot` has no field to declare
 * a controlled vocabulary; the cost of inferring is that a template author who
 * writes `chc.continence.suggested_level` (three segments) or
 * `continance.suggested_level` (typo) gets narrative prose back in a form field
 * with no error anywhere — the exact defect this PR fixed, reintroduced by a
 * data edit. Thrown at load, alongside the zod parse and the title check, so
 * the template data cannot disable its own gate in silence.
 */
export class UngatedLevelSlotError extends Error {
  constructor(templateKey: string, slotKey: string) {
    super(
      `template "${templateKey}" slot "${slotKey}" ends in "${LEVEL_SLOT_KEY_SUFFIX}" but its ` +
        'prefix is not a ChcDomain, so the level gate in resolveSlot would be silently disabled ' +
        'for it. Rename the slot to "<chc_domain>.suggested_level".',
    );
    this.name = 'UngatedLevelSlotError';
  }
}

/** Exported so the guard can be exercised against a hand-built template: the
 *  one frozen fixture is (and must stay) clean, so `loadTemplates` alone can
 *  never demonstrate the throw. */
export function assertLevelSlotsAreGated(template: ArtifactTemplate): void {
  for (const section of template.sections) {
    for (const slot of section.slots) {
      if (!slot.key.endsWith(LEVEL_SLOT_KEY_SUFFIX)) continue;
      if (levelSlotDomain(slot) === null) {
        throw new UngatedLevelSlotError(template.key, slot.key);
      }
    }
  }
}

/** All phase-1 templates, parsed and validated from fixtures/templates.json. */
export function loadTemplates(): ArtifactTemplate[] {
  if (cachedTemplates === null) {
    const parsed = Templates.parse(templatesJson);
    for (const template of parsed) {
      assertTitleNotBanned(template);
      assertLevelSlotsAreGated(template);
    }
    cachedTemplates = parsed;
  }
  return cachedTemplates;
}

/** A template declared an `ontology_match` pattern this matcher cannot honour.
 *  Thrown rather than quietly matching nothing — see `ontologyMatches`. */
export class InvalidOntologyPatternError extends Error {
  constructor(pattern: string, why: string) {
    super(`invalid ontology_match pattern "${pattern}": ${why}`);
    this.name = 'InvalidOntologyPatternError';
  }
}

export class UnknownTemplateError extends Error {
  constructor(key: string) {
    super(`no artifact template registered for key "${key}"`);
    this.name = 'UnknownTemplateError';
  }
}

export function templateByKey(key: ArtifactTemplate['key']): ArtifactTemplate {
  const found = loadTemplates().find((t) => t.key === key);
  if (found === undefined) throw new UnknownTemplateError(key);
  return found;
}

/**
 * Does an ontology_match pattern match a key? Exact string equality, or a
 * single trailing wildcard: 'medication.*' matches anything strictly under
 * the 'medication' prefix ('medication.furosemide'), never the prefix alone
 * ('medication') and never an unrelated key that merely starts with the same
 * characters ('medications.foo', 'medicationfoo') — the dot is part of the
 * anchor, not decoration.
 *
 * The key is compared with `startsWith` / `===`, never compiled into a regex,
 * so a key containing regex metacharacters ('medication.a+b(c)') is matched
 * literally and cannot alter the matching rule.
 *
 * ANY OTHER USE OF `*` THROWS. A pattern like 'medication.*.dose', '*' or
 * '.*' used to fall through to exact string comparison and therefore matched
 * nothing at all — a template author's typo became a slot that is silently
 * and permanently empty, indistinguishable from "no evidence yet". Templates
 * are frozen data validated at load; a malformed pattern is a data bug and
 * must fail loudly — see `InvalidOntologyPatternError`.
 */
export function ontologyMatches(pattern: string, ontologyKey: string): boolean {
  if (pattern === '') {
    throw new InvalidOntologyPatternError(pattern, 'a pattern may not be empty');
  }

  if (!pattern.includes('*')) {
    return pattern === ontologyKey;
  }

  if (!pattern.endsWith('.*') || pattern.indexOf('*') !== pattern.length - 1) {
    throw new InvalidOntologyPatternError(
      pattern,
      "the only wildcard form supported is a single trailing '.*'",
    );
  }

  const prefix = pattern.slice(0, -2);
  if (prefix === '') {
    throw new InvalidOntologyPatternError(pattern, "'.*' has no prefix to anchor on");
  }

  return ontologyKey.startsWith(`${prefix}.`);
}

/**
 * Level words among these values that the official DST form does not offer for
 * this section's domain.
 *
 * Nothing in this pipeline ever emits a CHC level of its own — a level can only
 * appear in an artefact because a source document said it. But a value of
 * "severe" landing in a Continence slot would make the pack contradict the
 * official form (three domains cap at High; altered states of consciousness has
 * no Severe at all), and that is the first thing a CHC-literate assessor
 * notices. Detected so it can be shown as a warning beside the record's own
 * words, never silently presented as this pack's level.
 *
 * Both vocabularies come from the frozen contract (`ChcDomain`, `ChcLevel`,
 * `CHC_DOMAIN_LEVELS`); nothing is listed here. A section key that is not a DST
 * domain (cover, method) yields nothing.
 *
 * Matching is whole-value and exact after trimming and lowercasing. A narrative
 * value that merely CONTAINS the word "high" or "low" is evidence, not a level,
 * and flagging it would bury the real case in noise.
 */
export function levelsNotAvailableInDomain(
  sectionKey: string,
  values: readonly string[],
): string[] {
  const domain = ChcDomain.safeParse(sectionKey);
  if (!domain.success) return [];
  const available = CHC_DOMAIN_LEVELS[domain.data];

  const flagged: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const level = ChcLevel.safeParse(trimmed.toLowerCase());
    if (!level.success) continue;
    if (available.includes(level.data)) continue;
    if (!flagged.includes(trimmed)) flagged.push(trimmed);
  }
  return flagged;
}

/**
 * A slot with no evidence path at all: fixed wording this pipeline is not
 * allowed to invent from facts (a cover statement, a scope statement, a
 * provenance note). Derived from template data — `citation_required` and
 * `gap_prompt` — never from a slot-key list, so a fifth structural slot
 * added to a template later is picked up automatically.
 */
export function isStructuralCopySlot(slot: Pick<Slot, 'citation_required' | 'gap_prompt'>): boolean {
  return slot.citation_required === false && slot.gap_prompt === null;
}

/**
 * A slot whose renderer is `quote`, requires a citation, but has no
 * `gap_prompt` to fall back on — the shape `drug_therapies.framework_note`
 * has. Its evidence is a verbatim framework citation, not a record fact:
 * legitimate to fill from `FRAMEWORK_CITATIONS`, never from composed prose.
 * Derived from template data (`citation_required`, `gap_prompt`, `renderer`),
 * never from a slot-key list.
 */
export function isFrameworkCitationSlot(
  slot: Pick<Slot, 'citation_required' | 'gap_prompt' | 'renderer'>,
): boolean {
  return slot.citation_required === true && slot.gap_prompt === null && slot.renderer === 'quote';
}

/**
 * Template key-naming CONVENTION for "this slot holds a controlled CHC
 * level, never narrative prose": the slot's key is exactly `<domain>` +
 * this suffix, where `<domain>` parses as a `ChcDomain`.
 */
const LEVEL_SLOT_KEY_SUFFIX = '.suggested_level';

/**
 * The `ChcDomain` a slot's suggested-level value must belong to, or `null`
 * if the slot is not a level slot at all.
 *
 * TODO(orchestrator): this is a KEY-NAMING CONVENTION, not a schema field —
 * `Slot` (lib/contracts.ts) has nowhere to declare "this slot's value is a
 * controlled vocabulary of ChcLevel". The real fix is a frozen-contract
 * change (`Slot.value_domain?: 'chc_level'`), which is out of scope here
 * because the contract does not change outside the orchestrator. Until then:
 * a template that renamed the `.suggested_level` suffix, or introduced a new
 * level-holding slot under a different naming convention, would silently
 * disable this check and let narrative text back into a level field again —
 * that is the cost of inferring the vocabulary from a key convention instead
 * of a schema field.
 */
export function levelSlotDomain(slot: Pick<Slot, 'key'>): ChcDomain | null {
  if (!slot.key.endsWith(LEVEL_SLOT_KEY_SUFFIX)) return null;
  const prefix = slot.key.slice(0, slot.key.length - LEVEL_SLOT_KEY_SUFFIX.length);
  const domain = ChcDomain.safeParse(prefix);
  return domain.success ? domain.data : null;
}

/** Every slot in a template, with the section it belongs to. */
export interface SlotWithSection {
  readonly section: { readonly key: string; readonly title: string };
  readonly slot: Slot;
}

export function slotsOf(template: ArtifactTemplate): SlotWithSection[] {
  const result: SlotWithSection[] = [];
  for (const section of template.sections) {
    for (const slot of section.slots) {
      result.push({ section: { key: section.key, title: section.title }, slot });
    }
  }
  return result;
}
