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

const Templates = z.array(ArtifactTemplate);

let cachedTemplates: ArtifactTemplate[] | null = null;

/** All phase-1 templates, parsed and validated from fixtures/templates.json. */
export function loadTemplates(): ArtifactTemplate[] {
  if (cachedTemplates === null) {
    cachedTemplates = Templates.parse(templatesJson);
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
