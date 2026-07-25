/**
 * Test helper: extract one `<section id="...">` from a rendered page.
 *
 * NOT a test file (no `.test.` in the name, so vitest's
 * `**\/*.{test,spec}.{ts,tsx}` include pattern does not collect it).
 *
 * This exists to kill a specific bad habit. Assertions about the conflicts
 * section used to be written by slicing the page between the heading text
 * "Disagreements between sources" and the next occurrence of `source-block`.
 * That makes the assertion depend on the ORDER of unrelated sections: adding
 * anything between those two markers silently pulls it into the slice, so
 * `expect(section).not.toContain(quote)` starts checking a different region
 * and a `<tr>` count starts counting other tables' rows. It cost this PR a
 * real decision — the new timeline section was originally appended after the
 * per-source blocks purely to stay outside that slice, i.e. the test was
 * dictating page layout.
 *
 * Scoping by id has neither problem: it is stable under reordering, and it
 * fails loudly (throws) if the section is absent rather than quietly
 * returning an empty string that every `not.toContain` assertion passes
 * against.
 */

const OPEN_TAG_RE = /<section\b[^>]*>/g;

export function sectionById(html: string, id: string): string {
  const idAttr = `id="${id}"`;

  OPEN_TAG_RE.lastIndex = 0;
  for (let match = OPEN_TAG_RE.exec(html); match !== null; match = OPEN_TAG_RE.exec(html)) {
    const tag = match[0];
    if (!tag.includes(idAttr)) continue;

    const start = match.index;
    const end = html.indexOf('</section>', start);
    if (end === -1) {
      throw new Error(`sectionById: <section ${idAttr}> is never closed`);
    }
    // No section rendered by inspect-html.ts nests another, so the first
    // closing tag is this section's. If that ever changes, this helper must
    // learn to balance tags rather than callers going back to slicing.
    const inner = html.slice(start, end + '</section>'.length);
    if (inner.includes('<section')&& inner.indexOf('<section', 1) !== -1) {
      throw new Error(
        `sectionById: <section ${idAttr}> contains a nested <section>; this helper cannot scope it`,
      );
    }
    return inner;
  }

  throw new Error(`sectionById: no <section ${idAttr}> found in the rendered page`);
}
