/**
 * THE KEYSTONE TEST.
 *
 * If this is red, every lane is building against a lie. It is the gate that
 * must pass at hour 0 before any lane launches, and the first thing the
 * integrator checks in every merge window.
 */

import { describe, it, expect } from 'vitest';
import {
  CaseSnapshot,
  CHC_DOMAIN_LEVELS,
  CHC_DOMAIN_NAMES,
  isValidLevel,
} from '../contracts';
import fixture from '../../fixtures/margaret.json';

function normalise(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/­/g, '')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

describe('contract', () => {
  it('fixture conforms to CaseSnapshot', () => {
    expect(() => CaseSnapshot.parse(fixture)).not.toThrow();
  });

  it('every verified claim quote is a literal substring of its source', () => {
    const snap = CaseSnapshot.parse(fixture);
    const byId = new Map(snap.sources.map((s) => [s.id, s]));

    for (const c of snap.claims) {
      if (!c.verified_substring) continue;
      const src = byId.get(c.source_id);
      expect(src, 'claim ' + c.id + ' has no source').toBeDefined();
      const found = normalise(src!.transcript).includes(normalise(c.quote));
      expect(found, 'quote not found in ' + src!.title + ': ' + c.quote).toBe(true);
    }
  });

  it('dropped claims exist and are excluded from every fact', () => {
    const snap = CaseSnapshot.parse(fixture);
    const dropped = snap.claims.filter((c) => !c.verified_substring).map((c) => c.id);
    expect(dropped.length, 'fixture should exercise the drop path').toBeGreaterThan(0);

    const cited = new Set(snap.facts.flatMap((f) => f.supporting_claim_ids));
    for (const id of dropped) expect(cited.has(id)).toBe(false);
  });

  it('stats match the claim set', () => {
    const snap = CaseSnapshot.parse(fixture);
    expect(snap.stats.claims_extracted).toBe(snap.claims.length);
    expect(snap.stats.claims_dropped).toBe(
      snap.claims.filter((c) => !c.verified_substring).length,
    );
  });

  it('no fact lacks evidence unless explicitly unknown', () => {
    const snap = CaseSnapshot.parse(fixture);
    for (const f of snap.facts) {
      if (f.status === 'unknown') continue;
      expect(
        f.supporting_claim_ids.length,
        'fact ' + f.id + ' (' + f.subject + ') has no supporting claims',
      ).toBeGreaterThan(0);
    }
  });

  it('every conflict references at least two real claims', () => {
    const snap = CaseSnapshot.parse(fixture);
    const ids = new Set(snap.claims.map((c) => c.id));
    for (const k of snap.conflicts) {
      expect(k.claim_ids.length).toBeGreaterThanOrEqual(2);
      for (const id of k.claim_ids) expect(ids.has(id)).toBe(true);
    }
  });

  it('gaps and facts only reference real claims', () => {
    const snap = CaseSnapshot.parse(fixture);
    const ids = new Set(snap.claims.map((c) => c.id));
    for (const g of snap.gaps) {
      for (const id of g.supporting_claim_ids) expect(ids.has(id)).toBe(true);
    }
    for (const f of snap.facts) {
      for (const id of f.supporting_claim_ids) expect(ids.has(id)).toBe(true);
    }
  });

  it('a verified citation always cites at least one fact', () => {
    const snap = CaseSnapshot.parse(fixture);
    const factIds = new Set(snap.facts.map((f) => f.id));
    for (const a of snap.artifacts.flatMap((x) => x.assertions)) {
      if (!a.citation_verified) continue;
      expect(a.fact_ids.length).toBeGreaterThan(0);
      for (const id of a.fact_ids) expect(factIds.has(id)).toBe(true);
    }
  });

  it('an unfillable slot has no fabricated text', () => {
    const snap = CaseSnapshot.parse(fixture);
    for (const a of snap.artifacts.flatMap((x) => x.assertions)) {
      if (a.fact_ids.length === 0) expect(a.text).toBe('');
    }
  });

  it('both phase-1 templates render from the same fact store', () => {
    const snap = CaseSnapshot.parse(fixture);
    const keys = snap.artifacts.map((a) => a.template_key);
    expect(keys).toContain('chc_dst_pack_v1');
    expect(keys).toContain('gp_brief_v1');
  });

  it('CHC domain levels match the Decision Support Tool', () => {
    // Three domains cap at High.
    expect(isValidLevel('continence', 'severe')).toBe(false);
    expect(isValidLevel('communication', 'severe')).toBe(false);
    expect(isValidLevel('psychological_emotional', 'severe')).toBe(false);

    // Altered states skips Severe entirely but reaches Priority.
    expect(isValidLevel('altered_consciousness', 'severe')).toBe(false);
    expect(isValidLevel('altered_consciousness', 'priority')).toBe(true);

    // These three reach Priority through a full scale.
    for (const d of ['breathing', 'behaviour', 'drug_therapies'] as const) {
      expect(isValidLevel(d, 'severe')).toBe(true);
      expect(isValidLevel(d, 'priority')).toBe(true);
    }

    // Every domain is named and has a level list.
    for (const d of Object.keys(CHC_DOMAIN_LEVELS) as Array<keyof typeof CHC_DOMAIN_NAMES>) {
      expect(CHC_DOMAIN_NAMES[d]).toBeTruthy();
      expect(CHC_DOMAIN_LEVELS[d].length).toBeGreaterThan(0);
    }
  });

  it('no key anywhere is a clinical judgement field', () => {
    // 'priority' as a CHC *level value* is legal. A judgement FIELD is not.
    const banned = /severity|urgency|\brank\b|\brisk\b|\bscore\b/i;
    const keys = JSON.stringify(fixture).match(/"[a-z_]+":/gi) ?? [];
    for (const k of keys) expect(banned.test(k), 'banned key ' + k).toBe(false);
  });
});
