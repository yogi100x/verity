import { describe, expect, it } from 'vitest';
import { escapeHtml, renderInspectPage, type InspectReportView } from '../inspect-html';

function makeReport(overrides: Partial<InspectReportView> = {}): InspectReportView {
  return {
    source: { id: 'src-1', title: 'Cardiology letter', kind: 'pdf' },
    transcript: 'Continue furosemide 40mg once daily.',
    kept: [
      {
        id: 'claim-1',
        ontology_key: 'medication.furosemide',
        subject: 'furosemide',
        value: '40mg once daily',
        quote: 'Continue furosemide 40mg once daily.',
        locator: { page: 1, char_start: 0, char_end: 37 },
        verified_substring: true,
      },
    ],
    dropped: [
      {
        claim: {
          subject: 'furosemide',
          value: 'stopped',
          quote: 'furosemide was discontinued',
          page: 1,
        },
        reason: 'quote not found in source transcript',
      },
    ],
    stats: { claims_extracted: 2, claims_dropped: 1 },
    usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 800 },
    mode: 'fixtures',
    retried: false,
    notice: null,
    ...overrides,
  };
}

describe('escapeHtml', () => {
  it('neutralises a script tag', () => {
    const result = escapeHtml('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
  });

  it('escapes all five special characters', () => {
    const result = escapeHtml(`& < > " '`);
    expect(result).toBe('&amp; &lt; &gt; &quot; &#39;');
  });
});

describe('renderInspectPage — security', () => {
  it('renders no raw <script> substring even when transcript and quote contain one', () => {
    const report = makeReport({
      transcript: 'Patient note: <script>alert(1)</script> continue furosemide "as before".',
      kept: [
        {
          id: 'claim-1',
          ontology_key: 'medication.furosemide',
          subject: 'furosemide',
          value: 'as before',
          quote: '<script>alert(1)</script> continue furosemide "as before"',
          locator: { page: 1, char_start: 0, char_end: 10 },
          verified_substring: true,
        },
      ],
    });
    const html = renderInspectPage([report]);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</script>');
    expect(html).not.toContain('"as before"');
  });
});

describe('renderInspectPage — content', () => {
  it('renders the real numbers next to their labels, not just the labels', () => {
    // Asserting on the label strings alone passes against an implementation
    // that prints the wrong numbers, or none.
    const html = renderInspectPage([makeReport(), makeReport({ dropped: [] })]);
    const stat = (label: string): string | undefined =>
      html.match(
        new RegExp(`>(\\d+)</span>\\s*<span class="summary-label">${label}`),
      )?.[1];

    expect(stat('sources')).toBe('2');
    expect(stat('claims extracted')).toBe('4'); // 2 + 2
    expect(stat('verified \\(kept\\)')).toBe('2'); // 1 + 1
    expect(stat('dropped')).toBe('1'); // 1 + 0
  });

  it('renders an honest notice when a source could not be read', () => {
    const html = renderInspectPage([
      makeReport({ notice: 'Parts of this source could not be read reliably.' }),
    ]);
    expect(html).toContain('could not be read reliably');
  });

  it('escapes a hostile page-level notice', () => {
    const html = renderInspectPage([makeReport()], '<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it("shows the source's dropped claim quote after the kept-claims section", () => {
    const html = renderInspectPage([makeReport()]);
    const keptIdx = html.indexOf('Kept — verified against the transcript');
    const droppedHeadingIdx = html.indexOf('Dropped — quote not found in source');
    const droppedQuoteIdx = html.indexOf('furosemide was discontinued');

    expect(keptIdx).toBeGreaterThan(-1);
    expect(droppedHeadingIdx).toBeGreaterThan(-1);
    expect(droppedQuoteIdx).toBeGreaterThan(-1);
    expect(droppedHeadingIdx).toBeGreaterThan(keptIdx);
    expect(droppedQuoteIdx).toBeGreaterThan(droppedHeadingIdx);
  });

  it('says "none dropped" when a source has zero dropped claims, instead of an empty table', () => {
    const html = renderInspectPage([makeReport({ dropped: [] })]);
    expect(html).toContain('none dropped');
  });

  it('shows retried flag when a report was retried', () => {
    const html = renderInspectPage([makeReport({ retried: true })]);
    expect(html).toMatch(/retried/i);
  });

  it('shows cache-read tokens when usage is present', () => {
    const html = renderInspectPage([makeReport()]);
    expect(html).toContain('cache-read tokens');
    expect(html).toContain('800');
  });
});

describe('renderInspectPage — empty case', () => {
  it('returns a valid document for an empty report list without throwing', () => {
    expect(() => renderInspectPage([])).not.toThrow();
    const html = renderInspectPage([]);
    expect(html.toLowerCase()).toContain('<!doctype html');
    expect(html).toContain('</html>');
  });
});

describe('renderInspectPage — no judgement language', () => {
  it("uses no judgement word in the page's own chrome", () => {
    // Scoped to the chrome the renderer authors — headings, labels, table
    // headers. Matching the whole document would fail the day a real clinical
    // quote contains the word "risk", which is content, not a judgement.
    const html = renderInspectPage([makeReport({ retried: true })]);
    const chrome = [
      ...[...html.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1] ?? ''),
      ...[...html.matchAll(/class="summary-label">([^<]*)</g)].map((m) => m[1] ?? ''),
      ...[...html.matchAll(/class="subheading[^"]*">([^<]*)</g)].map((m) => m[1] ?? ''),
      ...[...html.matchAll(/class="page-title">([^<]*)</g)].map((m) => m[1] ?? ''),
    ];
    expect(chrome.length).toBeGreaterThan(8);
    for (const text of chrome) {
      expect(text).not.toMatch(/severity|urgency|risk|score|triage|rank/i);
    }
  });
});
