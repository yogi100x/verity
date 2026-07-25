/**
 * WELL-MANAGED-NEED DETECTOR.
 *
 * The highest-leverage CHC feature and the highest-risk one. Stability
 * language co-occurring, in the same source, with active-intervention
 * evidence is flagged so the human can decide whether a "well managed"
 * note is marginalising a real need.
 *
 * Pure functions, zero dependencies, no I/O. The model may only ever select
 * a `CitationId` — never free citation text, never a paragraph number. That
 * is enforced by the type system, not by convention: `WellManagedFlag.citation`
 * is `CitationId`, a key of `FRAMEWORK_CITATIONS`, so a fabricated citation
 * string fails to typecheck rather than merely failing review.
 */

import type { ChcDomain, Source } from '../contracts';
import { CHC_DOMAIN_NAMES } from '../contracts';

/** VERIFIED VERBATIM against primary sources. Do not edit the strings.
 *  - National Framework for NHS CHC and NHS-funded Nursing Care,
 *    July 2022 (revised, corrected July 2023), paras 162-166
 *  - DST Guidance, October 2022, Practice Guidance note 23.2 */
export const FRAMEWORK_CITATIONS = {
  pg_23_2: {
    ref: 'DST Guidance 2022, Practice Guidance note 23.2',
    text: 'Where needs are being managed via medication (whether for behaviour or for physical health needs), it may be more appropriate to reflect this in the Drug Therapies and Medication domain.',
  },
  para_162: {
    ref: 'National Framework (July 2022, rev. July 2023), para 162',
    text: 'The decision-making rationale should not marginalise a need just because it is successfully managed: well-managed needs are still needs.',
  },
  para_164: {
    ref: 'National Framework (July 2022, rev. July 2023), paras 162-166',
    text: 'It may be necessary to ask the provider to complete a detailed diary over a suitable period of time to demonstrate the nature and frequency of the needs and interventions, and their effectiveness.',
  },
} as const;

export type CitationId = keyof typeof FRAMEWORK_CITATIONS;

export interface WellManagedFlag {
  source_id: string;
  stability_quote: string;
  intervention_quote: string;
  citation: CitationId;
  supporting_citations: CitationId[];
}

/** Stability language: settled, no incidents, stable on, no concerns, slept well.
 *
 *  Word boundaries are load-bearing, not cosmetic. Without `\b`, `/settled/`
 *  matches "unsettled" — the exact opposite of stability — and would attach a
 *  framework citation to evidence contradicting it. */
const STABILITY_PATTERNS: readonly RegExp[] = [
  /\bsettled\b/i,
  /\bno incidents\b/i,
  /\bstable on\b/i,
  /\bno concerns\b/i,
  /\bslept well\b/i,
];

/** Active-intervention evidence: PRN medication administered, hoist transfer,
 *  prompted or assisted care, 2-hourly checks, thickened fluids. */
const INTERVENTION_PATTERNS: readonly RegExp[] = [
  /PRN\b[\s\S]{0,80}?\badministered\b/i,
  /\bhoist\b[^.]{0,40}/i,
  /\b(?:prompted|assisted)\b[^.]{0,40}/i,
  /\b(?:2-hourly|two-hourly)\b[^.]{0,40}/i,
  /\bthickened fluids\b/i,
];

/** Maximum character distance between a stability match and an intervention
 *  match for them to count as co-occurring in the same passage, rather than
 *  merely appearing somewhere in the same (potentially long) source.
 *
 *  The brief specifies same-source co-occurrence. This proximity window is
 *  STRICTER than that, deliberately: precision over recall. A discharge
 *  summary that says "no incidents" in its post-operative section and
 *  "assisted to mobilise" four hundred characters earlier is not evidence of a
 *  well-managed need, and must not be flagged. The window is verified against
 *  `demo/documents/05-care-log.md` — every intended hit in that document,
 *  including the canonical Wed 08/07 PRN pairing, sits well inside it. */
const CO_OCCURRENCE_WINDOW_CHARS = 150;

/** Negation and tense guard. A negated stability statement ("not settled", "no
 *  longer settled") asserts the opposite of a well-managed need, and a negated
 *  intervention ("hoist not used") is not an intervention. Firing on either
 *  attaches a framework citation to evidence that does not support it — the
 *  most damaging failure this detector can produce. */
const NEGATORS =
  /\bnot\b|\bnever\b|n't\b|\bno longer\b|\bfar from\b|\brarely\b|\bseldom\b|\bhardly\b|\bbarely\b/i;

/** How far back the negation guard looks. Capped so a long clause cannot drag
 *  in an unrelated negator. */
const NEGATION_LOOKBEHIND_CHARS = 60;

interface TextMatch {
  text: string;
  index: number;
}

/** Text from the start of the match's own clause up to the match. Clause-scoped
 *  so a negation in the PREVIOUS sentence never suppresses a genuine match:
 *  "She did not eat. Settled overnight." is still a stability statement. */
function precedingClause(text: string, index: number): string {
  const window = text.slice(Math.max(0, index - NEGATION_LOOKBEHIND_CHARS), index);
  const boundary = Math.max(
    window.lastIndexOf('.'),
    window.lastIndexOf('!'),
    window.lastIndexOf('?'),
    window.lastIndexOf(';'),
    window.lastIndexOf('\n'),
  );
  return boundary === -1 ? window : window.slice(boundary + 1);
}

function isNegated(text: string, match: TextMatch, checkMatchText: boolean): boolean {
  if (NEGATORS.test(precedingClause(text, match.index))) return true;
  return checkMatchText && NEGATORS.test(match.text);
}

function findMatches(text: string, patterns: readonly RegExp[]): TextMatch[] {
  const matches: TextMatch[] = [];
  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const re = new RegExp(pattern.source, flags);
    let m: RegExpExecArray | null = re.exec(text);
    while (m !== null) {
      matches.push({ text: m[0], index: m.index });
      if (m[0].length === 0) re.lastIndex += 1;
      m = re.exec(text);
    }
  }
  return matches;
}

/** The intervention a stability statement is actually about, or null if none
 *  falls inside the co-occurrence window.
 *
 *  Interventions BEFORE the stability statement win, even when a later one is
 *  physically closer. A care log records the intervention and then its outcome
 *  — "PRN lorazepam administered ... Settled overnight, no incidents". Nearest
 *  by raw distance pairs that "Settled" with the *next day's* "Assisted
 *  wash/dress", which is the correct source but the wrong evidence, and the
 *  evidence is what gets printed beside the citation. A following intervention
 *  is used only when nothing precedes inside the window. */
function attributableIntervention(
  stability: TextMatch,
  interventionMatches: readonly TextMatch[],
): TextMatch | null {
  let preceding: TextMatch | null = null;
  let precedingDistance = Number.POSITIVE_INFINITY;
  let following: TextMatch | null = null;
  let followingDistance = Number.POSITIVE_INFINITY;

  for (const intervention of interventionMatches) {
    const distance = Math.abs(stability.index - intervention.index);
    if (distance > CO_OCCURRENCE_WINDOW_CHARS) continue;

    if (intervention.index <= stability.index) {
      if (distance < precedingDistance) {
        preceding = intervention;
        precedingDistance = distance;
      }
    } else if (distance < followingDistance) {
      following = intervention;
      followingDistance = distance;
    }
  }

  return preceding ?? following;
}

/**
 * Flags every passage where stability language genuinely co-occurs with
 * active-intervention evidence.
 *
 * One flag per stability statement that has an intervention inside the
 * window, in document order — not one flag per source. A care log records the
 * same well-managed need on several days, and each occurrence is separately
 * evidenced; collapsing them to a single "closest pair" per source surfaced
 * whichever pairing happened to be tightest rather than the ones an assessor
 * needs to see. Frequency of intervention is itself the CHC argument
 * (`para_164`). Precision is unchanged: every flag still requires both signals
 * inside the window, un-negated.
 *
 * Both quotes are verbatim substrings of `source.transcript`. Nothing is
 * paraphrased and no citation text is ever emitted — only a `CitationId`.
 *
 * These quotes are deliberately NOT passed through
 * `lib/safety/output_filter.ts`, and callers must not do so either. The
 * filter exists for GENERATED strings; a quote is document text — DATA —
 * surfaced as what the record says, never as something the product asserts.
 * A care log reading "no concerns" beside a PRN entry is the very evidence
 * this detector exists to show; filtering it would suppress the evidence
 * while leaving the (framework-cited) claim. Renderers present quotes as
 * quoted evidence with their source; any prose GENERATED around them still
 * goes through the filter.
 */
export function detectWellManagedNeeds(sources: readonly Source[]): WellManagedFlag[] {
  const flags: WellManagedFlag[] = [];

  for (const source of sources) {
    const text = source.transcript;

    const stabilityMatches = findMatches(text, STABILITY_PATTERNS).filter(
      (m) => !isNegated(text, m, false),
    );
    if (stabilityMatches.length === 0) continue;

    const interventionMatches = findMatches(text, INTERVENTION_PATTERNS).filter(
      (m) => !isNegated(text, m, true),
    );
    if (interventionMatches.length === 0) continue;

    const seen = new Set<number>();
    const ordered = [...stabilityMatches].sort((a, b) => a.index - b.index);

    for (const stability of ordered) {
      if (seen.has(stability.index)) continue;
      seen.add(stability.index);

      const intervention = attributableIntervention(stability, interventionMatches);
      if (intervention === null) continue;

      flags.push({
        source_id: source.id,
        stability_quote: stability.text,
        intervention_quote: intervention.text,
        citation: 'pg_23_2',
        supporting_citations: ['para_162'],
      });
    }
  }

  return flags;
}

/* ===================== CHC level helpers ===================== */

/** Official display heading for a CHC domain, always sourced from
 *  `CHC_DOMAIN_NAMES` — never hand-typed. There is no way to pass a custom
 *  heading: the function takes a `ChcDomain` and returns exactly the
 *  contract's name for it. */
export function getDomainHeading(domain: ChcDomain): string {
  return CHC_DOMAIN_NAMES[domain];
}
