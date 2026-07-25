/**
 * Loads the demo fixtures and validates them against the frozen contract
 * before anything else touches them. Fixture reads are `unknown` until a
 * Zod parse narrows them — never trusted structurally, even though they
 * ship in-repo.
 */

import { z } from 'zod';
import { ArtifactTemplate, CaseSnapshot } from '@/lib/contracts';
import margaretJson from '@/fixtures/margaret.json';
import templatesJson from '@/fixtures/templates.json';

const TemplateList = z.array(ArtifactTemplate);

export function loadMargaretSnapshot(): CaseSnapshot {
  const raw: unknown = margaretJson;
  return CaseSnapshot.parse(raw);
}

export function loadArtifactTemplates(): ArtifactTemplate[] {
  const raw: unknown = templatesJson;
  return TemplateList.parse(raw);
}
