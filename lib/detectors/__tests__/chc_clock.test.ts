import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { chcDeadlines, type ChcDeadline } from '../chc_clock';
import { CaseSnapshot, Fact } from '../../contracts';
import fixture from '../../../fixtures/margaret.json';
import { filterOutput } from '../../safety/output_filter';

/** Same urgency sweep the task spec requires: none of these words may ever
 *  appear in a statement or letter this module produces, however large
 *  `days_elapsed` grows. */
const URGENCY_SWEEP =
  /\b(urgent|overdue|late|immediately|as soon as possible|deadline)\b/i;

const PERSON_ID = crypto.randomUUID();

function checklistFact(overrides: Partial<z.input<typeof Fact>>) {
  return Fact.parse({
    id: crypto.randomUUID(),
    person_id: PERSON_ID,
    ontology_key: 'chc.checklist_date',
    subject: 'CHC Checklist',
    canonical_value: '2026-07-03',
    provenance: 'document_extracted',
    status: 'confirmed',
    valid_from: '2026-07-03',
    valid_to: null,
    supporting_claim_ids: [],
    conflict_id: null,
    superseded_by: null,
    ...overrides,
  });
}

function lettersText(deadline: ChcDeadline): readonly string[] {
  return [
    deadline.statement,
    deadline.chase_letter.salutation,
    deadline.chase_letter.body,
    deadline.chase_letter.closing,
  ];
}

/** `composeLetter`'s caller contract requires the filter to run over the
 *  CONCATENATED letter as it will be rendered, not the three fields
 *  separately: a banned phrase can straddle a join boundary and only the
 *  concatenated string sees it. */
function wholeLetter(deadline: ChcDeadline): string {
  const { salutation, body, closing } = deadline.chase_letter;
  return [salutation, body, closing].join('\n\n');
}

describe('chcDeadlines', () => {
  it('fires on a synthetic chc.checklist_date fact', () => {
    const now = new Date('2026-07-25T00:00:00.000Z'); // day 22
    const fact = checklistFact({});
    const result = chcDeadlines([fact], now);
    expect(result).toHaveLength(1);
    expect(result[0]!.fact_id).toBe(fact.id);
    expect(result[0]!.checklist_date).toBe('2026-07-03');
    expect(result[0]!.timescale_days).toBe(28);
  });

  it('produces the example day-22 statement and chase letter', () => {
    const now = new Date('2026-07-25T00:00:00.000Z');
    const fact = checklistFact({});
    const [deadline] = chcDeadlines([fact], now);
    expect(deadline!.days_elapsed).toBe(22);
    expect(deadline!.statement).toBe(
      "The CHC Checklist was completed on 3 July 2026. The National Framework's " +
        'timescale from Checklist to decision is 28 days. Day 22 today.',
    );
    expect(deadline!.chase_letter.recipient).toBe('chc_coordinator');
    expect(deadline!.chase_letter.salutation).toBe('Dear CHC Coordinator,');
    expect(deadline!.chase_letter.body).toContain(deadline!.statement);
    expect(deadline!.chase_letter.body).toContain(
      'Could you tell me the current status of the decision?',
    );
    expect(deadline!.chase_letter.closing).toBe('Yours faithfully,');
  });

  describe('days_elapsed boundary values', () => {
    const cases: ReadonlyArray<[string, string, number]> = [
      ['day 0 — same day', '2026-07-03T00:00:00.000Z', 0],
      ['day 27', '2026-07-30T00:00:00.000Z', 27],
      ['day 27 — one millisecond before day 28 ticks', '2026-07-30T23:59:59.999Z', 27],
      ['day 28 — exactly 28 × 24h after UTC midnight', '2026-07-31T00:00:00.000Z', 28],
      ['day 28 — still 28 late in that UTC day', '2026-07-31T23:59:59.999Z', 28],
      ['day 29 — spans the timescale', '2026-08-01T00:00:00.000Z', 29],
      // Timezone trap: `now` given with a non-UTC offset. 23:00+01:00 on the
      // checklist day is 22:00Z the SAME UTC day, so the count is still 0 —
      // the arithmetic reads the instant, never the machine's local clock.
      ['same day at 23:00+01:00 (= 22:00Z)', '2026-07-03T23:00:00+01:00', 0],
      // ...and 23:00-05:00 is 04:00Z the NEXT UTC day, so it is day 1. Whole
      // days are counted in UTC by definition; this pins that behaviour
      // rather than leaving it to the machine running the suite.
      ['same local day at 23:00-05:00 (= next 04:00Z)', '2026-07-03T23:00:00-05:00', 1],
    ];

    for (const [label, nowIso, expected] of cases) {
      it(`${label} -> days_elapsed=${expected}, no urgency wording`, () => {
        const fact = checklistFact({});
        const [deadline] = chcDeadlines([fact], new Date(nowIso));
        expect(deadline!.days_elapsed).toBe(expected);
        expect(deadline!.statement).toContain(`Day ${expected} today.`);
        expect(deadline!.statement).not.toMatch(URGENCY_SWEEP);
      });
    }
  });

  describe('skips', () => {
    const now = new Date('2026-08-01T00:00:00.000Z');

    it('superseded facts', () => {
      const fact = checklistFact({ superseded_by: crypto.randomUUID() });
      expect(chcDeadlines([fact], now)).toEqual([]);
    });

    it('facts with valid_to in the past', () => {
      const fact = checklistFact({ valid_to: '2026-07-10' });
      expect(chcDeadlines([fact], now)).toEqual([]);
    });

    it('free-text canonical_value falls back to valid_from — never V8 local-time parsing', () => {
      // 'new Date("completed 10 July 2026")'-style parsing is local-time in
      // V8: on a UTC+1 machine the clock would report the 9th for a
      // checklist done on the 10th, and a UTC server would disagree. The
      // free text must be rejected so the ISO valid_from wins on every box.
      const fact = checklistFact({
        canonical_value: 'The NHS Continuing Healthcare Checklist was completed on 10 July 2026',
        valid_from: '2026-07-10',
      });
      const [deadline] = chcDeadlines([fact], new Date('2026-07-25T00:00:00.000Z'));
      expect(deadline!.checklist_date).toBe('2026-07-10');
      expect(deadline!.days_elapsed).toBe(15);
    });

    it('unparseable dates (canonical_value and valid_from both non-dates)', () => {
      const fact = checklistFact({
        canonical_value: 'not a date',
        valid_from: null,
      });
      expect(chcDeadlines([fact], now)).toEqual([]);
    });

    it('other ontology keys', () => {
      const fact = checklistFact({ ontology_key: 'chc.mobility' });
      expect(chcDeadlines([fact], now)).toEqual([]);
    });

    // A future checklist date is a corrupted record, not a running clock.
    // Documented decision: skip, never emit a negative day count and never
    // clamp to Day 0 (clamping would present a corrupt date as though the
    // checklist had been completed today).
    it('a checklist date in the future (corrupted record) — one day ahead', () => {
      const fact = checklistFact({
        canonical_value: '2026-08-02',
        valid_from: '2026-08-02',
      });
      expect(chcDeadlines([fact], now)).toEqual([]);
    });

    it('a checklist date far in the future', () => {
      const fact = checklistFact({
        canonical_value: '2027-01-01',
        valid_from: '2027-01-01',
      });
      expect(chcDeadlines([fact], now)).toEqual([]);
    });

    it('day 0 is still emitted — only strictly future dates are skipped', () => {
      const fact = checklistFact({
        canonical_value: '2026-08-01',
        valid_from: '2026-08-01',
      });
      const result = chcDeadlines([fact], now);
      expect(result).toHaveLength(1);
      expect(result[0]!.days_elapsed).toBe(0);
    });
  });

  describe('checklist dates carrying a time-of-day', () => {
    it('floors to UTC midnight so the day count agrees with checklist_date', () => {
      const fact = checklistFact({ canonical_value: '2026-07-03T12:00:00.000Z' });
      const [deadline] = chcDeadlines([fact], new Date('2026-07-31T00:00:00.000Z'));
      expect(deadline!.checklist_date).toBe('2026-07-03');
      expect(deadline!.days_elapsed).toBe(28);
      expect(deadline!.statement).toContain('3 July 2026');
    });

    it('floors an offset-form date to its UTC calendar day', () => {
      // 2026-07-03T23:00:00+01:00 is 22:00Z on 3 July, so the UTC calendar
      // day is the 3rd, not the 4th.
      const fact = checklistFact({ canonical_value: '2026-07-03T23:00:00+01:00' });
      const [deadline] = chcDeadlines([fact], new Date('2026-07-25T00:00:00.000Z'));
      expect(deadline!.checklist_date).toBe('2026-07-03');
      expect(deadline!.days_elapsed).toBe(22);
    });
  });

  describe('fixtures/margaret.json', () => {
    const snap = CaseSnapshot.parse(fixture);

    // This block was a negative control until the orchestrator seeded the
    // Checklist outcome letter (source 06) on 25 Jul. It is now a positive
    // control with the same spirit: exactly one deadline, never more — a
    // second would be a false positive.
    it('records exactly one chc.checklist_date fact, cited, dated 10 July 2026', () => {
      const checklist = snap.facts.filter((f) => f.ontology_key === 'chc.checklist_date');
      expect(checklist).toHaveLength(1);
      expect(checklist[0]!.valid_from).toBe('2026-07-10');
      expect(checklist[0]!.supporting_claim_ids.length).toBeGreaterThan(0);
    });

    it('produces exactly one deadline with day-exact arithmetic on the real case', () => {
      const day15 = chcDeadlines(snap.facts, new Date('2026-07-25T00:00:00.000Z'));
      expect(day15).toHaveLength(1);
      expect(day15[0]!.checklist_date).toBe('2026-07-10');
      expect(day15[0]!.days_elapsed).toBe(15);
      expect(day15[0]!.timescale_days).toBe(28);

      // Demo day.
      const day16 = chcDeadlines(snap.facts, new Date('2026-07-26T00:00:00.000Z'));
      expect(day16[0]!.days_elapsed).toBe(16);

      // Statement and letter stay filter-clean on the real fact, both sides
      // of the 28-day boundary.
      for (const now of ['2026-07-26T00:00:00.000Z', '2026-08-20T00:00:00.000Z']) {
        const [d] = chcDeadlines(snap.facts, new Date(now));
        expect(filterOutput(wholeLetter(d!), []), now).toEqual({ ok: true });
      }
    });
  });

  describe('output_filter compliance', () => {
    it('passes filterOutput at day 5', () => {
      const fact = checklistFact({});
      const now = new Date('2026-07-08T00:00:00.000Z'); // day 5
      const [deadline] = chcDeadlines([fact], now);
      for (const text of lettersText(deadline!)) {
        expect(filterOutput(text, [])).toEqual({ ok: true });
      }
      expect(filterOutput(wholeLetter(deadline!), [])).toEqual({ ok: true });
    });

    it('passes filterOutput at day 40', () => {
      const fact = checklistFact({});
      const now = new Date('2026-08-12T00:00:00.000Z'); // day 40
      const [deadline] = chcDeadlines([fact], now);
      for (const text of lettersText(deadline!)) {
        expect(filterOutput(text, [])).toEqual({ ok: true });
      }
      expect(filterOutput(wholeLetter(deadline!), [])).toEqual({ ok: true });
    });

    it('passes filterOutput as a WHOLE letter across a wide sweep of day counts', () => {
      const fact = checklistFact({});
      for (const offset of [0, 1, 5, 22, 27, 28, 29, 40, 90, 365, 1000]) {
        const now = new Date(Date.parse('2026-07-03T00:00:00.000Z') + offset * 86_400_000);
        const [deadline] = chcDeadlines([fact], now);
        expect(filterOutput(wholeLetter(deadline!), []), `day ${offset}`).toEqual({
          ok: true,
        });
      }
    });

    it('the chase letter asks a question and uses the sanctioned absence phrasing', () => {
      const fact = checklistFact({});
      const [deadline] = chcDeadlines([fact], new Date('2026-08-12T00:00:00.000Z'));
      expect(deadline!.chase_letter.body).toContain(
        "I can't find a recorded decision",
      );
      expect(deadline!.chase_letter.body).toMatch(/\?/);
      // Words that assert something ought to have happened are never used.
      expect(deadline!.chase_letter.body).not.toMatch(
        /\b(missing|outstanding|still awaited|should|must|need|needs|chase|escalate)\b/i,
      );
    });
  });

  it('never emits urgency vocabulary across a sweep of day counts', () => {
    const fact = checklistFact({});
    const dayOffsets = [0, 1, 5, 22, 27, 28, 29, 40, 90, 365];
    for (const offset of dayOffsets) {
      const now = new Date(Date.parse('2026-07-03T00:00:00.000Z') + offset * 86_400_000);
      const [deadline] = chcDeadlines([fact], now);
      for (const text of lettersText(deadline!)) {
        expect(text).not.toMatch(URGENCY_SWEEP);
      }
    }
  });

  it('is deterministic: same facts + same now produce identical output', () => {
    const fact = checklistFact({});
    const now = new Date('2026-08-01T00:00:00.000Z');
    const before = now.getTime();
    const first = chcDeadlines([fact], now);
    const second = chcDeadlines([fact], now);
    expect(first).toEqual(second);
    // Purity: the caller's `now` is never mutated, so a second call with the
    // same object cannot drift.
    expect(now.getTime()).toBe(before);
  });

  it('reads no ambient clock and performs no I/O', () => {
    // Comments are stripped first: the module's doc comment legitimately
    // mentions "no Date.now()" as a stated property.
    const code = readFileSync(path.join(__dirname, '..', 'chc_clock.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Date\.now\(\)/);
    expect(code).not.toMatch(/new Date\(\s*\)/);
    expect(code).not.toMatch(/\b(readFileSync|fetch|require|process)\b/);
    expect(code).not.toMatch(/\bMath\.random\b/);
    expect(code).not.toMatch(/\brandomUUID\b/);
  });

  it('never branches on the day count against the timescale', () => {
    // A branch that changes wording once day 28 passes would be a seriousness
    // judgement, which this product has no field for and must not simulate in
    // prose. Strip comments first, then assert `TIMESCALE_DAYS` and
    // `days_elapsed`/`daysElapsed` never appear beside a comparison operator
    // or inside a ternary/conditional.
    const source = readFileSync(path.join(__dirname, '..', 'chc_clock.ts'), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/TIMESCALE_DAYS\s*(===?|!==?|[<>]=?)/);
    expect(code).not.toMatch(/(===?|!==?|[<>]=?)\s*TIMESCALE_DAYS/);
    expect(code).not.toMatch(/TIMESCALE_DAYS[^\n]*\?/);
    // The only comparison the day count is allowed to take part in is the
    // future-date well-formedness check, `daysElapsed < 0`.
    const dayCountComparisons =
      code.match(/daysElapsed\s*(===?|!==?|[<>]=?)\s*[^;)\n]+/g) ?? [];
    expect(dayCountComparisons).toEqual(['daysElapsed < 0']);
  });

  it('timescale_days is the literal 28 with a single source in the module', () => {
    const fact = checklistFact({});
    const now = new Date('2026-08-01T00:00:00.000Z');
    const [deadline] = chcDeadlines([fact], now);
    expect(deadline!.timescale_days).toBe(28);
    expect(deadline!.statement).toContain('28 days');

    // The prose must derive the number from `timescale_days`, not repeat a
    // second hard-coded literal `28` elsewhere in the module's logic. Strip
    // comments first so the doc-comment's prose references to "28 days"
    // don't count as a second source of truth in the code itself: only the
    // `const TIMESCALE_DAYS = 28` definition and its `28` literal type in
    // the `ChcDeadline` interface may remain.
    const modulePath = path.join(__dirname, '..', 'chc_clock.ts');
    const source = readFileSync(modulePath, 'utf8');
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const literalTwentyEightOccurrences = withoutComments.match(/\b28\b/g) ?? [];
    expect(literalTwentyEightOccurrences).toHaveLength(2);
  });
});
