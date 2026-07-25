/**
 * S7 — `discharge_pack_v1`, the third artefact template.
 *
 * THE CLAIM UNDER TEST: adding a new gatekeeper artefact costs a seed row in
 * `fixtures/templates.json` plus a renderer, not pipeline code. This file is
 * the test of that claim. `lib/ai/extract.ts`, `lib/ai/group.ts`,
 * `lib/ai/verify.ts`, `lib/ai/conflict.ts`, `lib/ai/reconcile.ts`,
 * `lib/ai/facts.ts`, `lib/ai/sources.ts`, `lib/ai/projections.ts` and
 * `lib/ai/artifacts.ts` were not touched to build this template — every
 * assertion below runs against the pipeline exactly as Lanes A/B/C/D left
 * it.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ArtifactTemplate, CaseSnapshot, type Source } from '@/lib/contracts';
import fixtureRaw from '@/fixtures/margaret.json';
import { loadTemplates, templateByKey, slotsOf } from '@/lib/ai/templates';
import { reconcile } from '@/lib/ai/reconcile';
import { detectGaps } from '@/lib/detectors/gaps';
import { projectAll } from '@/lib/ai/projections';
import { resolveSlot, buildArtifact, type BackingClaim } from '@/lib/ai/artifacts';
import { renderInspectPage, type InspectArtifactView, type InspectReportView } from '@/lib/ai/inspect-html';

const fixture = CaseSnapshot.parse(fixtureRaw);

const JUDGEMENT_KEY_RE = /severity|urgency|\bpriority\b|\brisk\b|\bscore\b|\brank\b/i;
const CREATED_AT = '2026-07-25T00:00:00.000Z';
const ASSEMBLED_ON = '2026-07-25';

/** Recursively walk an unknown value and collect every object KEY seen.
 *  'priority' is a legal CHC level VALUE, so only keys are checked — the
 *  same convention `artifacts.test.ts` / `artifacts-wiring.test.ts` use. */
function collectKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      keys.add(key);
      collectKeys(val, keys);
    }
  }
  return keys;
}

function fixtureSourcesById(): ReadonlyMap<string, Pick<Source, 'kind' | 'title'>> {
  const map = new Map<string, Pick<Source, 'kind' | 'title'>>();
  for (const source of fixture.sources) {
    map.set(source.id, { kind: source.kind, title: source.title });
  }
  return map;
}

/**
 * The exact fact set `/api/debug/inspect` builds every artefact from:
 * `reconcile()` over the fixture's own claims, plus `conflict.*` / `gap.*`
 * projections. Reproduced here rather than imported from the route (the
 * route exports only `GET`) so this test proves the claim against the same
 * pipeline calls, not against a shortcut.
 */
function reconciledFactSet() {
  const { conflicts, facts: rawFacts } = reconcile(fixture.claims, fixture.person.id, {
    sourcesById: fixtureSourcesById(),
  });
  const gaps = detectGaps(rawFacts, fixture.sources, new Date(CREATED_AT));
  const projected = projectAll({ personId: fixture.person.id, conflicts, gaps });
  return { conflicts, rawFacts, allFacts: [...rawFacts, ...projected] };
}

function claimsById(): ReadonlyMap<string, BackingClaim> {
  const map = new Map<string, BackingClaim>();
  for (const claim of fixture.claims) {
    map.set(claim.id, { verified_substring: claim.verified_substring, quote: claim.quote });
  }
  return map;
}

describe('discharge_pack_v1 — loads and validates', () => {
  it('is registered under its key and parses against the frozen ArtifactTemplate schema', () => {
    const template = templateByKey('discharge_pack_v1');
    expect(template.key).toBe('discharge_pack_v1');
    expect(() => ArtifactTemplate.parse(template)).not.toThrow();
  });

  it('appears in loadTemplates() alongside the two phase-1 templates', () => {
    const keys = loadTemplates().map((t) => t.key);
    expect(keys).toContain('discharge_pack_v1');
    expect(keys).toContain('chc_dst_pack_v1');
    expect(keys).toContain('gp_brief_v1');
  });

  it('conforms standalone to the shared array schema used by lib/__tests__/templates.test.ts', () => {
    const Templates = z.array(ArtifactTemplate);
    const templatesJson: unknown = JSON.parse(JSON.stringify(loadTemplates()));
    expect(() => Templates.parse(templatesJson)).not.toThrow();
  });

  it('every slot requires a citation and carries a non-null gap_prompt — no invented prose, no third option', () => {
    const template = templateByKey('discharge_pack_v1');
    for (const { slot } of slotsOf(template)) {
      expect(slot.citation_required, `slot ${slot.key} must require a citation`).toBe(true);
      expect(slot.gap_prompt, `slot ${slot.key} needs a gap_prompt`).toBeTruthy();
    }
  });

  it('no slot key smuggles a judgement word, and none is a suggested_level slot', () => {
    const template = templateByKey('discharge_pack_v1');
    for (const { slot } of slotsOf(template)) {
      expect(JUDGEMENT_KEY_RE.test(slot.key), `banned slot key ${slot.key}`).toBe(false);
      expect(slot.key.endsWith('suggested_level'), `${slot.key} must not be a level slot`).toBe(false);
    }
  });
});

describe('THE ABSTRACTION TEST — one fact set, three different artefacts', () => {
  it('builds all three templates from the SAME reconciled fact set; sections differ; none is empty; keys are distinct', () => {
    const { allFacts } = reconciledFactSet();
    const claims = claimsById();

    const results = loadTemplates().map((template) => ({
      template,
      result: buildArtifact({
        template,
        facts: allFacts,
        claimsById: claims,
        personId: fixture.person.id,
        createdAt: CREATED_AT,
      }),
    }));

    expect(results).toHaveLength(3);

    // Distinct template keys — the seed-row half of the claim.
    const templateKeys = results.map((r) => r.template.key);
    expect(new Set(templateKeys).size).toBe(3);

    // None of the three artefacts is empty.
    for (const { template, result } of results) {
      expect(result.artifact.assertions.length, `${template.key} produced no assertions at all`).toBeGreaterThan(0);
    }

    // Different SECTIONS — not just different slot counts. Each template's
    // own section-title set must differ from the other two, proving the
    // renderer for discharge_pack_v1 required no change to how sections are
    // derived (they still come straight from the frozen template, per
    // template).
    const sectionTitleSets = results.map(
      ({ template }) => new Set(template.sections.map((s) => s.title)),
    );
    for (let i = 0; i < sectionTitleSets.length; i += 1) {
      for (let j = i + 1; j < sectionTitleSets.length; j += 1) {
        const a = sectionTitleSets[i];
        const b = sectionTitleSets[j];
        if (a === undefined || b === undefined) throw new Error('unreachable');
        const overlapsCompletely = a.size === b.size && [...a].every((t) => b.has(t));
        expect(overlapsCompletely, `templates ${templateKeys[i]} and ${templateKeys[j]} share identical sections`).toBe(false);
      }
    }

    // Discharge pack specifically: exactly its four named sections, no more,
    // no fewer.
    const discharge = results.find((r) => r.template.key === 'discharge_pack_v1');
    if (discharge === undefined) throw new Error('discharge_pack_v1 missing from loadTemplates()');
    expect(discharge.template.sections.map((s) => s.key)).toEqual([
      'what_changed',
      'medication_picture',
      'what_to_watch',
      'follow_up',
    ]);
  });
});

describe('discharge_pack_v1 — every slot resolves to a citation, a gap_prompt, or a documented non-evidence path', () => {
  it('iterates the template\'s own slots (never a hardcoded list) and classifies each one', () => {
    const { allFacts } = reconciledFactSet();
    const claims = claimsById();
    const template = templateByKey('discharge_pack_v1');

    const filled: string[] = [];
    const gapPrompted: string[] = [];

    for (const { slot } of slotsOf(template)) {
      const resolution = resolveSlot(slot, allFacts, claims);

      if (resolution.fact_ids.length > 0) {
        filled.push(slot.key);
        // A citation-backed resolution is never simultaneously an omission.
        expect(resolution.omitted).toBe(false);
        expect(resolution.gap_prompt).toBeNull();
        continue;
      }

      if (resolution.gap_prompt !== null) {
        gapPrompted.push(slot.key);
        expect(resolution.gap_prompt).toBe(slot.gap_prompt);
        continue;
      }

      // discharge_pack_v1 declares no structural-copy and no framework-citation
      // slot (every slot has citation_required: true and a real gap_prompt),
      // so the third, documented non-evidence path never applies to this
      // template — reaching here is a genuine defect, not a legitimate state.
      throw new Error(`slot ${slot.key} neither filled, gap-prompted, nor a documented non-evidence path`);
    }

    // Every slot the template declares was accounted for exactly once.
    expect(filled.length + gapPrompted.length).toBe(slotsOf(template).length);

    // The pack is demonstrably not all gap prompts.
    expect(filled.length, 'expected at least one slot to fill from real evidence').toBeGreaterThan(0);
  });
});

describe('discharge_pack_v1 — Assertion.citation_verified is never true with empty fact_ids', () => {
  it('holds across the whole built Artifact (the DB constraint, mirrored)', () => {
    const { allFacts } = reconciledFactSet();
    const claims = claimsById();
    const template = templateByKey('discharge_pack_v1');

    const { artifact } = buildArtifact({
      template,
      facts: allFacts,
      claimsById: claims,
      personId: fixture.person.id,
      createdAt: CREATED_AT,
    });

    for (const assertion of artifact.assertions) {
      if (assertion.citation_verified) {
        expect(assertion.fact_ids.length, `assertion for ${assertion.slot_key} is verified with no facts`).toBeGreaterThan(0);
      }
    }
  });
});

describe('discharge_pack_v1 — real evidence from Margaret\'s record fills specific slots', () => {
  it('names which slots fill from real evidence, and asserts on the actual content', () => {
    const { allFacts } = reconciledFactSet();
    const claims = claimsById();
    const template = templateByKey('discharge_pack_v1');

    const { artifact } = buildArtifact({
      template,
      facts: allFacts,
      claimsById: claims,
      personId: fixture.person.id,
      createdAt: CREATED_AT,
    });

    const byKey = new Map(artifact.assertions.map((a) => [a.slot_key, a]));

    // The reconciled medication picture — furosemide (disputed) plus
    // amitriptyline/dapagliflozin. This is the ONLY medication table in the
    // pack: a second slot matching `medication.*` with the same `table`
    // renderer would render a byte-identical table under a different heading.
    const medications = byKey.get('medication_picture.current');
    expect(medications, 'medication_picture.current did not produce an assertion').toBeDefined();
    expect(medications?.citation_verified).toBe(true);
    expect(medications?.text).toContain('furosemide');

    // Test results the record states — creatinine / eGFR. The pack flags a
    // renal-review instruction, so omitting the renal result would leave the
    // GP the instruction without the number behind it.
    const results = byKey.get('what_changed.results');
    expect(results, 'what_changed.results did not produce an assertion').toBeDefined();
    expect(results?.citation_verified).toBe(true);
    expect(results?.text.toLowerCase()).toContain('creatinine');

    // Diagnoses the record states — heart failure.
    const diagnosis = byKey.get('what_changed.diagnosis');
    expect(diagnosis?.citation_verified).toBe(true);
    expect(diagnosis?.text.toLowerCase()).toContain('heart failure');

    // Instructions the record gives — the renal review / cardiology review /
    // daily weights instructions.
    const instructions = byKey.get('what_to_watch.instructions');
    expect(instructions?.citation_verified).toBe(true);
    expect(instructions?.text.length).toBeGreaterThan(0);

    // Who owes a follow-up — the heart failure specialist nurse referral.
    const referrals = byKey.get('follow_up.referrals');
    expect(referrals?.citation_verified).toBe(true);
    expect(referrals?.text.toLowerCase()).toContain('nurse');

    // Observations the record states — the self-reported weight increase.
    const observations = byKey.get('what_to_watch.observations');
    expect(observations?.citation_verified).toBe(true);
    expect(observations?.text.length).toBeGreaterThan(0);

    // Outstanding items the record flags — the detected gaps.
    const outstanding = byKey.get('follow_up.outstanding');
    expect(outstanding?.citation_verified).toBe(true);
    expect(outstanding?.text.length).toBeGreaterThan(0);
  });

  it('EVERY slot fills from Margaret’s evidence — no slot in this pack is permanently dead', () => {
    const { allFacts } = reconciledFactSet();
    const claims = claimsById();
    const template = templateByKey('discharge_pack_v1');

    const unfilled = slotsOf(template)
      .filter(({ slot }) => resolveSlot(slot, allFacts, claims).fact_ids.length === 0)
      .map(({ slot }) => slot.key);

    // A slot that can never fill is a dead slot: it renders as a gap prompt
    // forever and the reader cannot tell "nothing to report" from "this pack
    // has no way to report it". Every ontology_match here has a real producer
    // in the fixture, so the honest expectation is zero.
    expect(unfilled, `dead slots: ${unfilled.join(', ')}`).toEqual([]);
  });
});

describe('discharge_pack_v1 — no two slots are the same table twice', () => {
  it('no two slots share both an ontology_match set and a renderer', () => {
    const template = templateByKey('discharge_pack_v1');

    // Two slots with identical `ontology_match` AND identical `renderer`
    // resolve to the same facts and render identically — the same table under
    // two headings, which invites a reader to believe the headings mean
    // something different. (`gp_brief_v1` legitimately points two slots at
    // `medication.*`, but with DIFFERENT renderers: `table` and `conflict`.)
    const seen = new Map<string, string>();
    for (const { slot } of slotsOf(template)) {
      const signature = `${[...slot.ontology_match].sort().join('|')}::${slot.renderer}`;
      const previous = seen.get(signature);
      expect(
        previous,
        `slots ${String(previous)} and ${slot.key} both render ${signature} — identical content, two headings`,
      ).toBeUndefined();
      seen.set(signature, slot.key);
    }
  });
});

describe('discharge_pack_v1 — the pack says only what the record says', () => {
  it('no label, gap prompt, section title or template title carries judgement, likelihood or clinical direction', () => {
    const template = templateByKey('discharge_pack_v1');

    // The same sweep `scripts/verify.sh` runs over components, applied to the
    // words this pack actually prints. A slot KEY check (above) would not
    // catch a label reading "Medicines to stop urgently" — the key check and
    // this one are not the same test.
    const BANNED_WORDS =
      /\b(urgent|urgently|urgency|severe|severity|immediately|likely|probably|risk|risky|priority|triage|suggests|consistent with|should|must|need to|make sure|ensure|monitor for|watch out for)\b/i;

    const strings: Array<{ where: string; text: string }> = [
      { where: 'template.title', text: template.title },
      { where: 'template.audience', text: template.audience },
    ];
    for (const section of template.sections) {
      strings.push({ where: `section ${section.key} title`, text: section.title });
      for (const slot of section.slots) {
        strings.push({ where: `slot ${slot.key} label`, text: slot.label });
        if (slot.gap_prompt !== null) {
          strings.push({ where: `slot ${slot.key} gap_prompt`, text: slot.gap_prompt });
        }
      }
    }

    for (const { where, text } of strings) {
      const hit = BANNED_WORDS.exec(text);
      expect(hit === null, `${where} says "${String(hit?.[0])}": ${text}`).toBe(true);
    }
  });

  it('every gap prompt describes an absence or names a document to fetch, never a clinical action', () => {
    const template = templateByKey('discharge_pack_v1');
    for (const { slot } of slotsOf(template)) {
      const prompt = slot.gap_prompt;
      expect(prompt, `slot ${slot.key} needs a gap_prompt`).not.toBeNull();
      if (prompt === null) continue;

      // Either it states that nothing is recorded, or it asks for a document.
      const statesAbsence = /^(no|nothing|the records? (agree|do not))/i.test(prompt);
      const asksForDocument = /\b(add|ask (the|your)|request)\b/i.test(prompt);
      expect(
        statesAbsence || asksForDocument,
        `slot ${slot.key} gap_prompt neither states an absence nor names a document: ${prompt}`,
      ).toBe(true);
    }
  });
});

describe('discharge_pack_v1 — determinism', () => {
  it('building the pack twice over identical inputs differs only in generated ids', () => {
    const { allFacts } = reconciledFactSet();
    const claims = claimsById();
    const template = templateByKey('discharge_pack_v1');

    const build = (): unknown =>
      buildArtifact({
        template,
        facts: allFacts,
        claimsById: claims,
        personId: fixture.person.id,
        createdAt: CREATED_AT,
        person: { display_name: fixture.person.display_name },
        assembledOn: ASSEMBLED_ON,
        sources: fixture.sources,
      });

    // `id` / `artifact_id` are freshly generated per build by design; nothing
    // else may move. Redacting exactly those two and requiring byte equality
    // is stricter than comparing assertion counts.
    const redact = (value: unknown): string =>
      JSON.stringify(value).replace(/"(id|artifact_id)":"[^"]*"/g, '"$1":"<redacted>"');

    const first = build();
    const second = build();
    expect(redact(first)).toBe(redact(second));

    // And the ids really were regenerated — otherwise the redaction above
    // would be hiding nothing and the test would pass vacuously.
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
  });
});

describe('discharge_pack_v1 — the conflict section surfaces the furosemide question', () => {
  it('reads the generated_question from fixtures/margaret.json and finds it in the resolved slot text, never hardcoded', () => {
    const fixtureConflict = fixture.conflicts.find((c) => c.subject === 'furosemide');
    if (fixtureConflict === undefined) {
      throw new Error('fixture invariant broken: expected a furosemide conflict in margaret.json');
    }

    const { allFacts, conflicts } = reconciledFactSet();
    const derivedConflict = conflicts.find((c) => c.subject === 'furosemide');
    if (derivedConflict === undefined) {
      throw new Error('reconcile() did not derive a furosemide conflict from the fixture claims');
    }
    // The derived question must be the same one committed to the fixture —
    // otherwise this test would pass by asserting on the wrong text.
    expect(derivedConflict.generated_question).toBe(fixtureConflict.generated_question);

    const claims = claimsById();
    const template = templateByKey('discharge_pack_v1');
    const slot = slotsOf(template)
      .map((s) => s.slot)
      .find((s) => s.key === 'medication_picture.disagreements');
    if (slot === undefined) throw new Error('medication_picture.disagreements slot not found');

    const resolution = resolveSlot(slot, allFacts, claims);
    expect(resolution.fact_ids.length, 'expected the disagreements slot to resolve from a conflict.* fact').toBeGreaterThan(0);

    // The conflict fact reaching the slot is the PROJECTED one, keyed
    // `conflict.<subject>` — not the disputed `medication.furosemide` fact.
    // That matters for the resolved-conflict case asserted below.
    const matchedIds = new Set(resolution.fact_ids);
    const matchedKeys = allFacts.filter((f) => matchedIds.has(f.id)).map((f) => f.ontology_key);
    expect(matchedKeys.every((k) => k.startsWith('conflict.'))).toBe(true);

    const { artifact } = buildArtifact({
      template,
      facts: allFacts,
      claimsById: claims,
      personId: fixture.person.id,
      createdAt: CREATED_AT,
    });
    const assertion = artifact.assertions.find((a) => a.slot_key === 'medication_picture.disagreements');
    expect(assertion).toBeDefined();
    expect(assertion?.text).toContain(derivedConflict.generated_question);
  });

  it('a RESOLVED conflict never reaches the slot — it falls through to the gap prompt', () => {
    const { conflicts, rawFacts } = reconciledFactSet();
    const claims = claimsById();
    const template = templateByKey('discharge_pack_v1');
    const slot = slotsOf(template)
      .map((s) => s.slot)
      .find((s) => s.key === 'medication_picture.disagreements');
    if (slot === undefined) throw new Error('medication_picture.disagreements slot not found');

    // Same case, same claims — the ONLY change is that every conflict is now
    // marked resolved. `projectConflicts` filters on `resolution`, so no
    // `conflict.*` fact should be produced and the slot must degrade to its
    // own gap_prompt rather than presenting a settled question as open.
    const resolved = conflicts.map((c) => ({ ...c, resolution: 'user_resolved' as const }));
    const projected = projectAll({ personId: fixture.person.id, conflicts: resolved, gaps: [] });
    expect(projected.some((f) => f.ontology_key.startsWith('conflict.'))).toBe(false);

    const resolution = resolveSlot(slot, [...rawFacts, ...projected], claims);
    expect(resolution.fact_ids).toEqual([]);
    expect(resolution.gap_prompt).toBe(slot.gap_prompt);
    expect(resolution.omitted).toBe(false);
  });
});

describe('discharge_pack_v1 — no judgement KEY anywhere in the built artefact', () => {
  it('walks the real Artifact + BuildArtifactResult and finds no banned key ("priority" as a VALUE is legal, never checked)', () => {
    const { allFacts } = reconciledFactSet();
    const claims = claimsById();
    const template = templateByKey('discharge_pack_v1');

    const result = buildArtifact({
      template,
      facts: allFacts,
      claimsById: claims,
      personId: fixture.person.id,
      createdAt: CREATED_AT,
      person: { display_name: fixture.person.display_name },
      assembledOn: ASSEMBLED_ON,
      sources: fixture.sources,
    });

    const keys = collectKeys(result);
    for (const key of keys) {
      expect(JUDGEMENT_KEY_RE.test(key), `banned key "${key}"`).toBe(false);
    }
  });
});

describe('renderInspectPage — discharge_pack_v1 escaping', () => {
  it('a hostile value under a real discharge_pack_v1 slot key cannot inject a raw <script>', () => {
    const hostileArtifact: InspectArtifactView = {
      template_key: 'discharge_pack_v1',
      title: '<script>alert(1)</script> discharge pack',
      audience: '<img src=x onerror=alert(1)>',
      sections: [
        {
          key: 'medication_picture',
          // A hostile SECTION TITLE, not only hostile slot values: the section
          // heading is interpolated by the same renderer and was untested.
          title: '<script>alert(12)</script> The reconciled medication picture',
          slots: [
            {
              slot_key: 'medication_picture.disagreements',
              label: '<script>alert(2)</script>',
              renderer: 'conflict',
              text: '<script>alert(3)</script>',
              gap_prompt: null,
              values: [
                {
                  subject: '<script>alert(7)</script>',
                  value: '<script>alert(8)</script>',
                  valid_from: '<script>alert(9)</script>',
                  status: '<script>alert(10)</script>',
                },
              ],
              conflict_questions: ['<script>alert(11)</script>'],
              form_invalid_levels: [],
              citation_verified: true,
              citations: [
                {
                  quote: '<script>alert(4)</script> the water tablet',
                  source_title: '<script>alert(5)</script>',
                },
              ],
              state: 'filled',
              verbatim_attribution: null,
              verbatim_source: null,
              suppression: null,
            },
            {
              slot_key: 'medication_picture.current',
              label: 'What the records now say about each medicine',
              renderer: 'table',
              text: '',
              gap_prompt: '<script>alert(6)</script> no medicines appear',
              values: [],
              conflict_questions: [],
              form_invalid_levels: [],
              citation_verified: false,
              citations: [],
              state: 'gap_prompt',
              verbatim_attribution: null,
              verbatim_source: null,
              suppression: null,
            },
          ],
        },
      ],
      counts: { slots_total: 2, filled: 1, verbatim_copy: 0, gap_prompted: 1, omitted: 0, suppressed: 0 },
      omissions: [],
    };

    const minimalReport: InspectReportView = {
      source: { id: 'src-1', title: 'Placeholder source', kind: 'pdf' },
      transcript: 'placeholder transcript',
      kept: [],
      dropped: [],
      stats: { claims_extracted: 0, claims_dropped: 0 },
      usage: null,
      mode: 'fixtures',
      retried: false,
      notice: null,
    };

    const html = renderInspectPage([minimalReport], null, [], [], [hostileArtifact]);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    for (let n = 1; n <= 12; n += 1) {
      expect(html).not.toContain(`<script>alert(${n})`);
    }
    expect(html).toContain('&lt;script&gt;');
  });
});
