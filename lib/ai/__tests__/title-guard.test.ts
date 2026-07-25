/**
 * The banned-title check, hardened. The S7 review proved the bare
 * word-boundary check was defeated by exactly the likeliest disguises — a
 * mistitled template arrives plural or re-punctuated, not as the exact
 * banned string. `prd.md` bans these titles because an artefact wearing one
 * would present organised evidence as a clinical document.
 */

import { describe, expect, it } from 'vitest';

import {
  BannedArtefactTitleError,
  assertTitleNotBanned,
  loadTemplates,
} from '../templates';

function templateWithTitle(title: string): { key: 'chc_dst_pack_v1'; title: string } {
  return { key: 'chc_dst_pack_v1', title };
}

describe('banned artefact titles — the disguises are caught', () => {
  // Each of these slipped the previous check; every one must now throw.
  const disguises = [
    'Handover notes for the GP',
    'Discharge Referrals Pack',
    'Clinical Summaries',
    'Handover-note',
    'Hand over note',
    'S.B.A.R. pack',
    'Clinical  summary',
  ];

  // And these must still load fine — the check must not become a dumb
  // substring match that bans legitimate titles.
  const legitimate = [
    'After the hospital stay — what the records show',
    'What I want to tell my doctor',
    'Notes for the family',
    'Summary of documents held', // "summary" alone is not banned; "clinical summary" is
  ];

  it('committed templates all load (sanity)', () => {
    expect(() => loadTemplates()).not.toThrow();
  });

  for (const title of disguises) {
    it(`rejects: ${JSON.stringify(title)}`, () => {
      expect(() => assertTitleNotBanned(templateWithTitle(title))).toThrow(
        BannedArtefactTitleError,
      );
    });
  }

  for (const title of legitimate) {
    it(`allows: ${JSON.stringify(title)}`, () => {
      expect(() => assertTitleNotBanned(templateWithTitle(title))).not.toThrow();
    });
  }
});
