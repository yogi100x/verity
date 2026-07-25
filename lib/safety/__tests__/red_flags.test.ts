import { describe, it, expect } from 'vitest';
import { scanRedFlags } from '../red_flags';
import * as RedFlagsModule from '../red_flags';

/**
 * The rule table under test is research/01 §6, restated in prd.md §8.3 and
 * docs/lanes/lane-c-safety.md §1. Every rule has at least one positive and
 * one negated case here, and the §6 trigger-phrase families are covered
 * phrase-by-phrase in "coverage of the §6 trigger families" below.
 */

describe('scanRedFlags — 14 rules, positive + negated', () => {
  const cases: { rule: string; positive: string; negated: string }[] = [
    {
      rule: 'cardiac_chest_pain',
      positive: 'I have chest pain',
      negated: 'no chest pain',
    },
    {
      rule: 'stroke_fast',
      positive: 'she has face drooping on one side',
      negated: 'no face drooping',
    },
    {
      rule: 'airway_breathing',
      positive: 'he is choking',
      negated: 'not choking',
    },
    {
      rule: 'anaphylaxis',
      positive: 'there is swelling of the throat',
      negated: 'no swelling of the throat',
    },
    {
      rule: 'sepsis',
      positive: 'her skin looks mottled skin all over',
      negated: 'never had mottled skin',
    },
    {
      rule: 'uncontrolled_bleeding',
      positive: 'he is vomiting blood',
      negated: 'denies vomiting blood',
    },
    {
      rule: 'collapse_seizure_head_injury',
      positive: 'there was loss of consciousness',
      negated: 'no loss of consciousness',
    },
    {
      rule: 'thunderclap_headache_meningism',
      positive: 'sudden severe headache this morning',
      negated: 'no sudden severe headache',
    },
    {
      rule: 'cauda_equina',
      positive: 'she reports loss of bladder control',
      negated: 'no loss of bladder control',
    },
    {
      rule: 'acute_limb_testicular_ischaemia',
      positive: 'sudden severe testicular pain since last night',
      negated: 'no sudden severe testicular pain',
    },
    {
      rule: 'self_harm_intent',
      positive: 'he has taken an overdose tonight',
      negated: 'he has not taken an overdose',
    },
    {
      rule: 'obstetric',
      positive: 'heavy vaginal bleeding since this morning',
      negated: 'no heavy vaginal bleeding',
    },
    {
      rule: 'metabolic',
      positive: 'blood tests show high ketones',
      negated: 'no high ketones',
    },
    {
      rule: 'acute_eye',
      positive: 'sudden painless loss of vision in one eye',
      negated: 'no sudden painless loss of vision',
    },
  ];

  for (const { rule, positive, negated } of cases) {
    it(`${rule}: fires on canonical positive phrase`, () => {
      const hit = scanRedFlags(positive);
      expect(hit).not.toBeNull();
      expect(hit?.rule).toBe(rule);
    });

    it(`${rule}: does not fire on negated/past-tense phrase`, () => {
      expect(scanRedFlags(negated)).toBeNull();
    });
  }

  it('covers all fourteen rules', () => {
    expect(new Set(cases.map((c) => c.rule)).size).toBe(14);
  });
});

/**
 * One assertion per trigger-phrase family in the §6 table. These are the
 * phrasings a person actually types, not the table's shorthand. A rule name
 * is asserted only where §6 attributes the phrase unambiguously to one rule;
 * elsewhere it is enough that the pipeline halts.
 */
describe('coverage of the §6 trigger families', () => {
  const halts: { family: string; text: string; rule?: string }[] = [
    // 1 — cardiac chest pain
    { family: 'central chest pain', text: 'central chest pain since lunchtime', rule: 'cardiac_chest_pain' },
    { family: 'crushing chest pain', text: 'a crushing pain in my chest', rule: 'cardiac_chest_pain' },
    { family: 'tight chest', text: 'my chest feels tight', rule: 'cardiac_chest_pain' },
    { family: 'pressure on the chest', text: 'there is pressure on my chest', rule: 'cardiac_chest_pain' },
    { family: 'radiation to the arm', text: 'the pain is radiating to my left arm', rule: 'cardiac_chest_pain' },
    { family: 'radiation to the jaw', text: 'an ache spreading up into my jaw', rule: 'cardiac_chest_pain' },
    { family: 'radiation to the neck', text: 'the pain goes into my neck', rule: 'cardiac_chest_pain' },
    { family: 'radiation to the back', text: 'the pain is shooting through to my back', rule: 'cardiac_chest_pain' },
    { family: 'chest pain with sweating', text: 'chest pain and I am sweating buckets', rule: 'cardiac_chest_pain' },
    { family: 'chest pain with nausea', text: 'chest pain and feeling sick', rule: 'cardiac_chest_pain' },

    // 2 — stroke (FAST)
    { family: 'face drooping', text: 'her face is drooping', rule: 'stroke_fast' },
    { family: 'face has dropped', text: 'one side of her face has dropped', rule: 'stroke_fast' },
    { family: 'facial droop', text: 'obvious facial droop', rule: 'stroke_fast' },
    { family: 'arm weakness', text: 'sudden arm weakness', rule: 'stroke_fast' },
    { family: 'cannot lift the arm', text: 'she cannot lift her arm', rule: 'stroke_fast' },
    { family: 'slurred speech', text: 'his speech is slurred', rule: 'stroke_fast' },
    { family: 'garbled speech', text: 'garbled speech this afternoon', rule: 'stroke_fast' },
    { family: 'cannot get words out', text: "she can't get her words out", rule: 'stroke_fast' },
    { family: 'sudden confusion', text: 'sudden confusion this evening', rule: 'stroke_fast' },
    { family: 'sudden loss of vision in one eye', text: 'sudden loss of vision in one eye', rule: 'stroke_fast' },

    // 3 — airway / breathing
    { family: "can't complete a sentence", text: "she can't complete a sentence", rule: 'airway_breathing' },
    { family: 'cannot finish a sentence', text: 'he cannot finish a sentence', rule: 'airway_breathing' },
    { family: 'gasping', text: 'she is gasping for breath', rule: 'airway_breathing' },
    { family: 'choking', text: 'he is choking on his food', rule: 'airway_breathing' },
    { family: 'blue lips', text: 'his lips have gone blue', rule: 'airway_breathing' },
    { family: 'grey lips', text: 'grey lips and cold to touch', rule: 'airway_breathing' },
    { family: 'grey face', text: 'her face has gone grey', rule: 'airway_breathing' },
    { family: 'stridor', text: 'there is stridor when she breathes in', rule: 'airway_breathing' },
    { family: 'noisy breathing', text: 'noisy breathing since this morning', rule: 'airway_breathing' },
    { family: 'cannot breathe', text: "she can't breathe properly", rule: 'airway_breathing' },

    // 4 — anaphylaxis
    { family: 'swelling of the lips', text: 'swelling of the lips', rule: 'anaphylaxis' },
    { family: 'tongue swelling', text: 'her tongue is swelling', rule: 'anaphylaxis' },
    { family: 'throat closing', text: 'his throat is closing up', rule: 'anaphylaxis' },
    { family: 'difficulty swallowing', text: 'difficulty swallowing since the injection', rule: 'anaphylaxis' },
    { family: 'wheeze plus rash after exposure', text: 'wheezing and a rash after the antibiotic', rule: 'anaphylaxis' },
    { family: 'sense of impending doom', text: 'a sense of impending doom', rule: 'anaphylaxis' },

    // 5 — sepsis
    { family: 'extreme shivering', text: 'extreme shivering all night', rule: 'sepsis' },
    { family: 'severe muscle pain', text: 'severe muscle pain everywhere', rule: 'sepsis' },
    { family: 'passing no urine in a day', text: 'passing no urine since yesterday', rule: 'sepsis' },
    { family: 'has not passed urine', text: 'she has not passed any urine today', rule: 'sepsis' },
    { family: 'severe breathlessness', text: 'severe breathlessness at rest', rule: 'sepsis' },
    { family: "feel like I'm going to die", text: 'she says she feels like she is going to die', rule: 'sepsis' },
    { family: 'mottled skin', text: 'mottled skin on her legs', rule: 'sepsis' },
    { family: 'discoloured skin', text: 'her skin looks discoloured', rule: 'sepsis' },
    { family: 'child: non-blanching rash', text: 'a non-blanching rash on his tummy', rule: 'sepsis' },
    { family: 'child: rash that does not fade', text: "a rash that doesn't fade under a glass", rule: 'sepsis' },
    { family: 'child: cold hands and feet', text: 'cold hands and feet with a temperature', rule: 'sepsis' },
    { family: 'child: abnormally fast breathing', text: 'abnormally fast breathing since teatime', rule: 'sepsis' },

    // 6 — uncontrolled bleeding
    { family: "bleeding that won't stop", text: "bleeding that won't stop with pressure", rule: 'uncontrolled_bleeding' },
    { family: 'cannot stop the bleeding', text: "I can't stop the bleeding", rule: 'uncontrolled_bleeding' },
    { family: 'vomiting blood', text: 'vomiting blood this morning', rule: 'uncontrolled_bleeding' },
    { family: 'coughing up blood', text: 'coughing up blood', rule: 'uncontrolled_bleeding' },
    { family: 'black tarry stool', text: 'black tarry stools for two days', rule: 'uncontrolled_bleeding' },
    { family: 'large volume of blood in stool', text: 'a lot of blood in the toilet', rule: 'uncontrolled_bleeding' },

    // 7 — collapse / seizure / head injury
    { family: 'loss of consciousness', text: 'a brief loss of consciousness', rule: 'collapse_seizure_head_injury' },
    { family: 'passed out', text: 'she passed out in the kitchen', rule: 'collapse_seizure_head_injury' },
    { family: 'unresponsive', text: 'he is unresponsive', rule: 'collapse_seizure_head_injury' },
    { family: 'first-ever seizure', text: 'her first ever seizure', rule: 'collapse_seizure_head_injury' },
    { family: 'seizure longer than 5 minutes', text: 'a seizure lasting eight minutes', rule: 'collapse_seizure_head_injury' },
    { family: 'not waking after a seizure', text: 'not waking after a seizure', rule: 'collapse_seizure_head_injury' },
    { family: 'head injury with vomiting', text: 'head injury and now vomiting', rule: 'collapse_seizure_head_injury' },
    { family: 'banged head then confused', text: 'she banged her head and is confused', rule: 'collapse_seizure_head_injury' },
    { family: 'unequal pupils', text: 'unequal pupils since the fall', rule: 'collapse_seizure_head_injury' },
    { family: 'child: fits', text: 'he is having a fit', rule: 'collapse_seizure_head_injury' },

    // 8 — thunderclap headache / meningism
    { family: 'worst headache of my life', text: 'the worst headache of my life', rule: 'thunderclap_headache_meningism' },
    { family: 'sudden severe headache', text: 'a sudden severe headache', rule: 'thunderclap_headache_meningism' },
    { family: 'headache came on suddenly', text: 'the headache came on suddenly', rule: 'thunderclap_headache_meningism' },
    { family: 'neck stiffness', text: 'neck stiffness and a temperature', rule: 'thunderclap_headache_meningism' },
    { family: 'stiff neck', text: 'a stiff neck this morning', rule: 'thunderclap_headache_meningism' },
    { family: 'light sensitivity', text: 'light sensitivity in a dark room', rule: 'thunderclap_headache_meningism' },
    { family: 'sensitive to light', text: 'she is sensitive to light', rule: 'thunderclap_headache_meningism' },

    // 9 — cauda equina
    { family: 'loss of bladder control', text: 'new loss of bladder control', rule: 'cauda_equina' },
    { family: 'loss of bowel control', text: 'new loss of bowel control', rule: 'cauda_equina' },
    { family: 'lost control of bowels', text: 'she has lost control of her bowels', rule: 'cauda_equina' },
    { family: 'saddle numbness', text: 'numbness around the saddle area', rule: 'cauda_equina' },
    { family: 'numbness around the genitals', text: 'numbness around my genitals', rule: 'cauda_equina' },
    { family: 'new weakness in both legs', text: 'new weakness in both legs with back pain', rule: 'cauda_equina' },
    { family: 'both legs giving way', text: 'both legs are giving way', rule: 'cauda_equina' },

    // 10 — acute limb / testicular ischaemia
    { family: 'cold pale painful limb', text: 'a cold pale painful limb', rule: 'acute_limb_testicular_ischaemia' },
    { family: 'leg gone cold and white', text: 'her leg has gone cold and white', rule: 'acute_limb_testicular_ischaemia' },
    { family: 'pulseless limb', text: 'the foot is pulseless', rule: 'acute_limb_testicular_ischaemia' },
    { family: 'testicular pain and swelling', text: 'testicular pain and swelling', rule: 'acute_limb_testicular_ischaemia' },
    { family: 'pain in the testicle', text: 'severe pain in his testicle', rule: 'acute_limb_testicular_ischaemia' },

    // 11 — self-harm / suicidal intent
    { family: 'suicidal', text: 'she is feeling suicidal', rule: 'self_harm_intent' },
    { family: 'plan to end my life', text: 'I have a plan to end my life', rule: 'self_harm_intent' },
    { family: 'means to end my life', text: 'she has the means to take her own life', rule: 'self_harm_intent' },
    { family: 'already taken an overdose', text: 'he has already taken an overdose', rule: 'self_harm_intent' },
    { family: 'harm myself', text: 'I want to hurt myself', rule: 'self_harm_intent' },

    // 12 — obstetric
    { family: 'heavy vaginal bleeding in pregnancy', text: 'heavy vaginal bleeding at 30 weeks', rule: 'obstetric' },
    { family: 'bleeding while pregnant', text: 'she is 20 weeks pregnant and bleeding', rule: 'obstetric' },
    { family: 'severe abdominal pain in pregnancy', text: 'severe tummy pain in pregnancy', rule: 'obstetric' },
    { family: 'reduced fetal movements', text: 'reduced fetal movements today', rule: 'obstetric' },
    { family: 'baby has stopped moving', text: 'the baby has stopped moving', rule: 'obstetric' },
    { family: 'have not felt the baby move', text: 'I have not felt the baby move since last night', rule: 'obstetric' },

    // 13 — metabolic
    { family: 'high ketones', text: 'her ketones are high', rule: 'metabolic' },
    { family: 'vomiting with high blood sugar', text: 'vomiting all morning with a blood sugar of 24', rule: 'metabolic' },
    { family: 'hypo not responding to treatment', text: 'a hypo not responding to treatment', rule: 'metabolic' },
    { family: 'new severe drowsiness', text: 'new severe drowsiness this afternoon', rule: 'metabolic' },
    { family: 'acute confusion', text: 'acute confusion since this morning', rule: 'metabolic' },

    // 14 — acute eye
    { family: 'sudden painless loss of vision', text: 'sudden painless loss of vision', rule: 'acute_eye' },
    { family: 'severe eye pain with halos', text: 'severe eye pain with halos around lights', rule: 'acute_eye' },
    { family: 'eye pain with vomiting', text: 'eye pain and vomiting', rule: 'acute_eye' },
  ];

  for (const { family, text, rule } of halts) {
    it(`halts on: ${family}`, () => {
      const hit = scanRedFlags(text);
      expect(hit).not.toBeNull();
      if (rule !== undefined) expect(hit?.rule).toBe(rule);
    });
  }
});

describe('spec-mandated scenarios', () => {
  it('"no chest pain" does not fire', () => {
    expect(scanRedFlags('no chest pain')).toBeNull();
  });

  it('"history of chest pain in 2019" does not fire', () => {
    expect(scanRedFlags('history of chest pain in 2019')).toBeNull();
  });

  it('"chest pain resolved last month" does not fire', () => {
    expect(scanRedFlags('chest pain resolved last month')).toBeNull();
  });

  it('"chest pain going into my left arm and I\'m sweating" fires on the cardiac rule', () => {
    const hit = scanRedFlags(
      "chest pain going into my left arm and I'm sweating",
    );
    expect(hit).not.toBeNull();
    expect(hit?.rule).toBe('cardiac_chest_pain');
    expect(hit?.matchedText.toLowerCase()).toBe('chest pain');
  });

  it('a four-digit year before 2025 anywhere in the context window suppresses the match', () => {
    expect(scanRedFlags('chest pain back in 2020, all better now')).toBeNull();
  });

  it('a year of 2025 or later does not suppress — the guard is for past history only', () => {
    const hit = scanRedFlags('chest pain since 2026');
    expect(hit?.rule).toBe('cardiac_chest_pain');
  });

  it('returns null for text with no red flags', () => {
    expect(scanRedFlags('I have a mild headache and slept fine')).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(scanRedFlags('')).toBeNull();
  });

  it('returns null for whitespace and punctuation only', () => {
    expect(scanRedFlags('   ...  ')).toBeNull();
  });
});

describe('negation and tense guard — all ten guard tokens', () => {
  const guards: { guard: string; text: string }[] = [
    { guard: 'no', text: 'no chest pain' },
    { guard: 'not', text: 'she is not choking' },
    { guard: 'denies', text: 'she denies chest pain' },
    { guard: 'never', text: 'never had chest pain' },
    { guard: 'without', text: 'breathless without chest pain' },
    { guard: 'used to', text: 'I used to get chest pain' },
    { guard: 'previously', text: 'previously had chest pain' },
    { guard: 'history of', text: 'history of chest pain' },
    { guard: 'resolved', text: 'chest pain, now resolved' },
    { guard: 'year before 2025', text: 'chest pain in 2019' },
  ];

  for (const { guard, text } of guards) {
    it(`"${guard}" suppresses the match`, () => {
      expect(scanRedFlags(text)).toBeNull();
    });
  }

  it('multi-word guards match as a token sequence, not as separate words', () => {
    // "used" alone and "to" alone are not guards; only the sequence is.
    expect(scanRedFlags('I used an inhaler and now I have chest pain')?.rule).toBe(
      'cardiac_chest_pain',
    );
    // "history" alone is not a guard either.
    expect(scanRedFlags('the history is long, she has chest pain now')?.rule).toBe(
      'cardiac_chest_pain',
    );
  });

  it('a multi-word guard still counts when it straddles the edge of the five-token window', () => {
    // "used" sits six tokens before the match, "to" sits five: at least one
    // guard token is inside the window, so the phrase is found.
    expect(scanRedFlags('she used to complain a lot about chest pain')).toBeNull();
  });

  it('the guard applies on either side of the match', () => {
    expect(scanRedFlags('chest pain is not something she has')).toBeNull();
    expect(scanRedFlags('denies any chest pain')).toBeNull();
  });

  it('the guard window is exactly five tokens — a guard six tokens away does not suppress', () => {
    // no(0) chest(1) pain(2) but(3) she(4) does(5) have(6) unequal(7) pupils(8)
    // "no" is six tokens before "unequal", so the collapse rule still fires.
    const hit = scanRedFlags('no chest pain but she does have unequal pupils');
    expect(hit?.rule).toBe('collapse_seizure_head_injury');
  });

  it('SPEC-ACCURATE OVER-SUPPRESSION: an unrelated "not" inside the five-token window suppresses the match', () => {
    // The "not" below has nothing to do with the symptom, yet it sits inside
    // the window and the match is suppressed. This is NOT a bug to fix: the spec
    // (research/01 §6, prd.md §8.3) fixes the guard window at five tokens
    // either side with no dependency parse. Widening or narrowing the window
    // to "fix" this would be a change to a safety rule.
    // I(0) am(1) not(2) sure(3) but(4) I(5) have(6) chest(7) pain(8)
    // — "not" is exactly five tokens before "chest".
    expect(scanRedFlags('I am not sure but I have chest pain')).toBeNull();

    // One token further away and it fires, which is the same rule seen from
    // the other side.
    const hit = scanRedFlags('I am not sure why but I have crushing chest pain');
    expect(hit?.rule).toBe('cardiac_chest_pain');
  });

  it('a guard token inside the matched phrase does not suppress that phrase', () => {
    // Several §6 triggers contain a negator by construction. They must not
    // negate themselves.
    expect(scanRedFlags('passing no urine since yesterday')?.rule).toBe('sepsis');
    expect(scanRedFlags('a hypo not responding to treatment')?.rule).toBe('metabolic');
    expect(scanRedFlags('not waking after a seizure')?.rule).toBe(
      'collapse_seizure_head_injury',
    );
    expect(scanRedFlags('I have not felt the baby move since last night')?.rule).toBe(
      'obstetric',
    );
  });

  it('an implausible four-digit number is not treated as a year', () => {
    // Without a year floor, "1500" would silently suppress an emergency
    // halt. False negatives are the one direction this module must not fail.
    expect(scanRedFlags('I walked 1500 steps and got chest pain')?.rule).toBe(
      'cardiac_chest_pain',
    );
  });

  it('the guard suppresses only the negated match, not other matches in the text', () => {
    const hit = scanRedFlags('no chest pain at all, but her lips have gone blue');
    expect(hit?.rule).toBe('airway_breathing');
  });
});

describe('case, punctuation and typography normalisation', () => {
  it('fires regardless of casing', () => {
    const hit = scanRedFlags('CHEST PAIN and I feel awful');
    expect(hit).not.toBeNull();
    expect(hit?.rule).toBe('cardiac_chest_pain');
  });

  it('negation guard is also case-insensitive', () => {
    expect(scanRedFlags('NO CHEST PAIN')).toBeNull();
  });

  it('hyphenated phrasing matches', () => {
    expect(scanRedFlags('non-blanching rash')?.rule).toBe('sepsis');
  });

  it('curly apostrophes match the same as straight ones', () => {
    expect(scanRedFlags('she can’t complete a sentence')?.rule).toBe(
      'airway_breathing',
    );
  });

  it('matchedText is a verbatim slice of the caller’s text', () => {
    const text = 'She has Chest Pain this morning.';
    const hit = scanRedFlags(text);
    expect(hit?.matchedText).toBe('Chest Pain');
    expect(text).toContain(hit?.matchedText);
  });
});

/**
 * This scanner runs inside a product whose entire vocabulary is long-term
 * care. A halt on routine care-note language would make the tool unusable,
 * so these strings must stay silent. None of them is a §6 trigger.
 */
describe('does not fire on routine long-term-care language', () => {
  const quiet: string[] = [
    'she needs a wheelchair fitting and a new sling',
    'she has a pressure sore on her chest wall dressed weekly',
    'we are planning end of life care with the palliative team',
    'long-standing incontinence managed with pads day and night',
    'reduced movement in her left shoulder since the stroke in 2019',
    'her blood sugars run a little high in the mornings',
    'she settled well overnight with no concerns recorded',
    'the district nurse reviewed the leg ulcer dressing',
    'he uses a hoist for all transfers and needs two carers',
    'I am chasing the rheumatology referral made nine weeks ago',
  ];

  for (const text of quiet) {
    it(`stays silent: "${text}"`, () => {
      expect(scanRedFlags(text)).toBeNull();
    });
  }
});

describe('no severity ordering — first (leftmost) hit wins', () => {
  it('returns the leftmost match, not the "worst" rule', () => {
    const hit = scanRedFlags('unequal pupils and chest pain');
    expect(hit?.rule).toBe('collapse_seizure_head_injury');

    const reversed = scanRedFlags('chest pain and unequal pupils');
    expect(reversed?.rule).toBe('cardiac_chest_pain');
  });

  it('is deterministic — the same input always returns the same hit', () => {
    const text = 'she is gasping for breath and her lips are blue';
    const first = scanRedFlags(text);
    for (let i = 0; i < 5; i++) {
      expect(scanRedFlags(text)).toEqual(first);
    }
  });
});

describe('API surface — this function must never be given document text', () => {
  it('the module exports only scanRedFlags at runtime (RedFlagHit is a type, erased at build)', () => {
    expect(Object.keys(RedFlagsModule)).toEqual(['scanRedFlags']);
  });

  it('scanRedFlags takes exactly one parameter (text), not a Source/document object', () => {
    expect(scanRedFlags.length).toBe(1);
  });

  it('scanRedFlags accepts a plain string and returns a plain hit shape, not a Source-shaped input', () => {
    // A Source/document object (per lib/contracts.ts) has a `transcript` field
    // and other structured metadata. scanRedFlags has no parameter that could
    // accept such an object — passing a string is the only valid call shape,
    // which this test pins by calling it with a bare string literal.
    const hit = scanRedFlags('chest pain');
    expect(hit === null || (typeof hit.rule === 'string' && typeof hit.matchedText === 'string')).toBe(true);
  });

  it('the hit carries exactly two fields: rule and matchedText', () => {
    const hit = scanRedFlags('chest pain');
    expect(hit).not.toBeNull();
    expect(Object.keys(hit ?? {}).sort()).toEqual(['matchedText', 'rule']);
  });
});
