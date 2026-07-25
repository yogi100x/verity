/**
 * Deterministic red-flag scanner.
 *
 * Runs on the person's own concern text / free-text fields ONLY, before any
 * model call. This function must NEVER be given uploaded document text
 * (a `Source.transcript`, a `Claim.quote`, or any other document-derived
 * string) — a discharge letter mentioning historical chest pain would fire
 * on every single run. Callers pass concern/free-text input; nothing else.
 *
 * This module intentionally exposes no function that accepts a `Source`,
 * document, or structured object of any kind — only `scanRedFlags(text)`.
 * That is a deliberate API-surface constraint, not an oversight: there is
 * nowhere to plug document text into this scanner even by mistake.
 *
 * On a hit, the caller halts the pipeline and makes no model call. There is
 * no severity or ranking here — the leftmost non-negated match wins. Ranking
 * by seriousness is precisely the medical-device behaviour this product
 * avoids: the fourteen rules are a flat list, deliberately unordered by
 * gravity, and the returned `rule` is a label for the halt card, not a
 * judgement about how ill anyone is.
 *
 * Rule provenance: research/01 §6 (the fourteen-rule table), restated in
 * prd.md §8.3 and docs/lanes/lane-c-safety.md §1. Never relax a rule. Adding
 * phrasings is always safe (it halts more often); removing one is not.
 *
 * Pure function. Zero dependencies. Zero I/O.
 */

export interface RedFlagHit {
  rule: string;
  matchedText: string;
}

interface Token {
  word: string;
  start: number;
  end: number;
}

/**
 * A phrase is a sequence of parts matched against consecutive tokens:
 *  - `word`  — one exact token
 *  - `oneOf` — one token from a set (spelling / inflection variants)
 *  - `skip`  — 0..max intervening tokens ("pain going *into my left* arm")
 *
 * `skip` is bounded and matched shortest-first, so matching stays total,
 * deterministic and O(tokens × phrase) with a small constant.
 */
type PhrasePart =
  | { readonly kind: 'word'; readonly word: string }
  | { readonly kind: 'oneOf'; readonly words: readonly string[] }
  | { readonly kind: 'skip'; readonly max: number };

type Phrase = readonly PhrasePart[];

interface Rule {
  name: string;
  phrases: readonly Phrase[];
}

/** Any one of these tokens. */
function oneOf(...words: readonly string[]): PhrasePart {
  return { kind: 'oneOf', words };
}

/** Up to `max` intervening tokens. */
function gap(max: number): PhrasePart {
  return { kind: 'skip', max };
}

/** Build a phrase; bare strings are split on spaces into exact-token parts. */
function seq(...parts: readonly (string | PhrasePart)[]): Phrase {
  const out: PhrasePart[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      for (const word of part.split(' ')) {
        if (word.length > 0) out.push({ kind: 'word', word });
      }
    } else {
      out.push(part);
    }
  }
  return out;
}

// Shared vocabularies, kept as named constants so the rule table reads like
// the research §6 table rather than like a regex.
const CANNOT = oneOf("can't", 'cannot', 'cant', 'unable', 'struggling');
const PAIN_WORDS = oneOf(
  'pain',
  'pains',
  'painful',
  'ache',
  'aching',
  'tightness',
  'pressure',
  'discomfort',
  'heaviness',
  'crushing',
  'squeezing',
  'gripping',
);
// Split out from PAIN_WORDS for the chest phrases specifically: "pressure"
// and "tight" need a shorter gap than "pain" so that pressure-area / skin
// integrity wording ("a pressure sore on her chest") cannot fire a cardiac
// halt in a product whose whole corpus is care notes.
const ACHE_WORDS = oneOf('pain', 'pains', 'ache', 'aching', 'discomfort', 'burning');
const PRESSURE_WORDS = oneOf(
  'crushing',
  'squeezing',
  'gripping',
  'tight',
  'tightness',
  'heavy',
  'heaviness',
  'pressure',
);
const RADIATION_VERBS = oneOf(
  'radiating',
  'radiates',
  'radiated',
  'spreading',
  'spreads',
  'spread',
  'going',
  'goes',
  'moving',
  'moves',
  'moved',
  'travelling',
  'traveling',
  'travels',
  'shooting',
  'shoots',
);
// A directional preposition is required after the radiation verb so that
// "the pain has been going on for weeks" and "I'm going back to the gym"
// cannot fire the cardiac rule.
const RADIATION_PREPOSITIONS = oneOf('to', 'into', 'down', 'across', 'through', 'up');
const RADIATION_TARGETS = oneOf(
  'arm',
  'arms',
  'jaw',
  'neck',
  'back',
  'shoulder',
  'shoulders',
  'elbow',
  'wrist',
);
const LIMBS = oneOf('leg', 'legs', 'arm', 'foot', 'hand', 'limb', 'toes', 'fingers');

const RULES: readonly Rule[] = [
  {
    // §6 rule 1 — central/crushing/tight chest pain; radiation to arm, jaw,
    // neck, back; chest pain with sweating / nausea / breathlessness (the
    // bare "chest pain" phrase already covers every co-symptom variant).
    name: 'cardiac_chest_pain',
    phrases: [
      seq('chest', oneOf('pain', 'pains')),
      seq(ACHE_WORDS, gap(3), 'chest'),
      seq(PRESSURE_WORDS, gap(2), 'chest'),
      seq('chest', gap(2), oneOf('tight', 'tightness', 'tightening', 'heavy', 'heaviness', 'pressure', 'crushing', 'squeezing', 'pain', 'pains', 'discomfort', 'ache')),
      seq('central', gap(1), 'chest'),
      seq(PAIN_WORDS, gap(4), RADIATION_VERBS, RADIATION_PREPOSITIONS, gap(2), RADIATION_TARGETS),
      seq('heart', 'attack'),
    ],
  },
  {
    // §6 rule 2 — FAST: face drooping, arm weakness, slurred or garbled
    // speech, sudden confusion, sudden loss of vision in one or both eyes.
    name: 'stroke_fast',
    phrases: [
      seq('face', gap(3), oneOf('drooping', 'drooped', 'droop', 'dropped', 'fallen')),
      seq(oneOf('facial'), gap(1), oneOf('droop', 'drooping', 'weakness', 'asymmetry')),
      seq(oneOf('drooping', 'droop', 'drooped'), 'on one side'),
      seq(oneOf('arm', 'arms'), oneOf('weakness', 'weak')),
      seq('weakness', 'in', gap(2), oneOf('arm', 'arms')),
      seq(CANNOT, gap(2), oneOf('lift', 'raise', 'move'), gap(2), oneOf('arm', 'arms')),
      seq(oneOf('slurred', 'slurring', 'garbled', 'muddled'), oneOf('speech', 'words', 'speaking')),
      seq('speech', gap(2), oneOf('slurred', 'slurring', 'garbled', 'muddled', 'unclear')),
      seq(CANNOT, gap(2), oneOf('speak', 'talk')),
      seq(CANNOT, gap(3), 'words out'),
      seq('sudden', gap(1), oneOf('confusion', 'confused')),
      seq('suddenly', gap(1), oneOf('confused', 'confusion')),
      seq('sudden loss of', oneOf('vision', 'sight')),
      seq('sudden', oneOf('vision', 'sight'), 'loss'),
      seq('suddenly lost', gap(2), oneOf('vision', 'sight')),
      seq(oneOf('having', 'had', 'has'), gap(1), 'stroke'),
    ],
  },
  {
    // §6 rule 3 — can't complete a sentence, gasping, choking, blue or grey
    // lips/face, stridor, noisy breathing.
    name: 'airway_breathing',
    phrases: [
      seq(CANNOT, gap(3), oneOf('complete', 'finish', 'get', 'say'), gap(2), 'sentence'),
      seq('gasping'),
      seq(oneOf('fighting', 'gasping', 'struggling'), 'for breath'),
      seq('struggling to breathe'),
      seq(CANNOT, gap(2), oneOf('breathe', 'breath')),
      seq(CANNOT, gap(2), 'catch', gap(2), 'breath'),
      seq('choking'),
      seq(oneOf('blue', 'grey', 'gray', 'purple'), gap(3), oneOf('lips', 'lip', 'face', 'mouth')),
      seq(oneOf('lips', 'lip', 'face'), gap(3), oneOf('blue', 'grey', 'gray', 'purple')),
      seq('stridor'),
      seq('noisy breathing'),
      seq('breathing', gap(2), oneOf('noisy', 'noisily')),
    ],
  },
  {
    // §6 rule 4 — swelling of lips/tongue/throat, difficulty swallowing,
    // wheeze + rash after exposure, sense of impending doom.
    name: 'anaphylaxis',
    phrases: [
      seq('swelling', gap(2), oneOf('lips', 'lip', 'tongue', 'throat', 'mouth', 'face', 'airway')),
      seq(oneOf('lips', 'lip', 'tongue', 'throat', 'mouth'), gap(3), oneOf('swelling', 'swollen', 'swelled', 'closing', 'closed', 'tight', 'tightening')),
      seq(oneOf('difficulty', 'trouble', 'problems'), oneOf('swallowing', 'breathing')),
      seq('struggling to swallow'),
      seq(CANNOT, gap(2), 'swallow'),
      seq('impending doom'),
      seq(oneOf('wheeze', 'wheezing', 'wheezy'), gap(6), oneOf('rash', 'hives', 'welts')),
      seq(oneOf('rash', 'hives', 'welts'), gap(6), oneOf('wheeze', 'wheezing', 'wheezy')),
      seq(oneOf('anaphylaxis', 'anaphylactic', 'epipen')),
    ],
  },
  {
    // §6 rule 5 — slurred speech + confusion (covered by rule 2), extreme
    // shivering or muscle pain, passing no urine in a day, severe
    // breathlessness, "feel like I'm going to die", mottled/discoloured/blue
    // skin; child: non-blanching rash, cold hands and feet, abnormally fast
    // breathing. (Fits are covered by rule 7.)
    name: 'sepsis',
    phrases: [
      seq(oneOf('extreme', 'severe', 'violent', 'uncontrollable'), gap(1), oneOf('shivering', 'shivers', 'shakes', 'shaking')),
      seq('shivering', gap(2), oneOf('uncontrollably', 'violently')),
      seq(oneOf('severe', 'extreme', 'terrible', 'awful'), gap(1), oneOf('muscle', 'muscular'), gap(1), 'pain'),
      seq('passing no urine'),
      // The negator is inside the matched span here, so the guard cannot
      // suppress the very phrasing the rule is written to catch.
      seq(oneOf('no', 'not'), gap(3), oneOf('passed', 'passing', 'produced'), gap(2), oneOf('urine', 'water', 'wee')),
      seq(oneOf("haven't", "hasn't", 'havent', 'hasnt'), gap(2), oneOf('passed', 'passing'), gap(2), oneOf('urine', 'water', 'wee')),
      seq('no urine'),
      seq(oneOf('severe', 'extreme', 'severely', 'extremely'), gap(1), oneOf('breathless', 'breathlessness')),
      seq('going to die'),
      seq(oneOf('mottled', 'discoloured', 'discolored', 'blotchy'), gap(1), oneOf('skin', 'legs', 'arms')),
      seq('skin', gap(3), oneOf('mottled', 'discoloured', 'discolored', 'blotchy', 'blue', 'grey', 'gray')),
      seq('non blanching', gap(1), 'rash'),
      seq('rash', gap(3), oneOf('blanch', 'blanching', 'fade', 'fades', 'faded')),
      seq('glass test'),
      seq('cold hands and feet'),
      seq(oneOf('hands', 'feet'), 'and', oneOf('hands', 'feet'), gap(2), 'cold'),
      seq(oneOf('abnormally', 'very', 'really', 'unusually'), 'fast breathing'),
      seq('breathing', gap(2), oneOf('fast', 'quickly', 'rapidly')),
      seq(oneOf('sepsis', 'septic', 'septicaemia', 'septicemia')),
    ],
  },
  {
    // §6 rule 6 — bleeding that won't stop with pressure, vomiting blood,
    // coughing up blood, black tarry stool, large volume of blood in stool.
    name: 'uncontrolled_bleeding',
    phrases: [
      seq('bleeding', gap(2), oneOf("won't", 'wont', 'will', 'not', 'cannot', "can't", "doesn't"), gap(1), 'stop'),
      seq(CANNOT, gap(3), 'stop', gap(2), oneOf('bleeding', 'blood', 'bleed')),
      seq(oneOf('vomiting', 'vomited', 'throwing', 'threw', 'coughing', 'coughed', 'spitting', 'bringing'), gap(2), 'blood'),
      seq('coffee ground', oneOf('vomit', 'vomiting', 'sick')),
      seq(oneOf('black', 'tarry'), gap(1), oneOf('stool', 'stools', 'poo', 'motions', 'faeces', 'feces')),
      seq('blood', gap(2), oneOf('stool', 'stools', 'poo', 'motions', 'faeces', 'feces')),
      seq('bleeding heavily'),
      seq(oneOf('lot', 'lots', 'volume', 'litre', 'pints'), 'of blood'),
      seq(oneOf('haemorrhage', 'hemorrhage', 'haemorrhaging', 'hemorrhaging')),
    ],
  },
  {
    // §6 rule 7 — loss of consciousness, first-ever seizure, seizure >5 min,
    // not waking after a seizure, head injury with vomiting / confusion /
    // unequal pupils. Also carries the child "fits" trigger from rule 5.
    name: 'collapse_seizure_head_injury',
    phrases: [
      seq('loss of consciousness'),
      seq('lost consciousness'),
      seq(oneOf('unconscious', 'unresponsive', 'collapsed')),
      seq(oneOf('passed', 'blacked'), 'out'),
      seq(oneOf('first', 'first-ever'), gap(1), oneOf('seizure', 'fit', 'convulsion')),
      seq('seizure', gap(3), oneOf('minutes', 'mins', 'minute')),
      seq(oneOf('fitting', 'convulsing'), gap(3), oneOf('minutes', 'mins')),
      seq(oneOf('not', "hasn't", "won't", "isn't"), gap(2), oneOf('waking', 'woken', 'wake'), gap(3), oneOf('seizure', 'fit')),
      seq(oneOf('having', 'had', 'has'), gap(1), oneOf('fit', 'fits', 'seizure', 'seizures', 'convulsion')),
      // Bare "fitting" is deliberately not a trigger: "a wheelchair fitting"
      // and "fitting the sling" are routine care-note phrasings.
      seq(oneOf('is', 'was', 'started', 'still', 'keeps'), gap(1), 'fitting'),
      seq('head', oneOf('injury', 'trauma'), gap(4), oneOf('vomiting', 'vomited', 'sick', 'confused', 'confusion', 'drowsy', 'unequal')),
      seq(oneOf('vomiting', 'vomited', 'confused', 'confusion', 'drowsy'), gap(4), 'head', oneOf('injury', 'trauma')),
      seq(oneOf('hit', 'banged', 'bumped', 'knocked'), gap(2), 'head', gap(6), oneOf('vomiting', 'vomited', 'sick', 'confused', 'confusion', 'drowsy', 'unresponsive')),
      seq('unequal pupils'),
      seq('pupils', gap(2), oneOf('unequal', 'uneven', 'different')),
    ],
  },
  {
    // §6 rule 8 — worst headache of my life, sudden severe headache;
    // headache + neck stiffness + light sensitivity + rash.
    name: 'thunderclap_headache_meningism',
    phrases: [
      seq('worst headache'),
      seq('thunderclap'),
      seq(oneOf('sudden', 'suddenly'), gap(3), oneOf('headache', 'head')),
      seq('headache', gap(3), oneOf('sudden', 'suddenly')),
      seq('neck stiffness'),
      seq('stiff neck'),
      seq('neck', gap(2), 'stiff'),
      seq('light sensitivity'),
      seq('sensitive to light'),
      seq('photophobia'),
      seq(oneOf('light', 'lights'), gap(2), oneOf('hurt', 'hurts', 'hurting')),
    ],
  },
  {
    // §6 rule 9 — new loss of bladder or bowel control, saddle numbness,
    // new weakness in both legs with back pain. Note: bare "incontinence" is
    // deliberately NOT a trigger — this product's CHC continence domain
    // discusses long-standing continence needs constantly, and firing an
    // emergency halt on that would make the tool unusable. Only *new* or
    // *sudden* loss of control triggers, exactly as §6 words it.
    name: 'cauda_equina',
    phrases: [
      seq('loss of', oneOf('bladder', 'bowel', 'bowels'), gap(1), 'control'),
      seq('lost control of', gap(1), oneOf('bladder', 'bowel', 'bowels')),
      seq(CANNOT, gap(3), oneOf('control', 'feel'), gap(2), oneOf('bladder', 'bowel', 'bowels')),
      seq(oneOf('new', 'newly', 'sudden', 'suddenly'), gap(2), oneOf('incontinent', 'incontinence')),
      seq('numbness', gap(4), oneOf('genitals', 'genital', 'anus', 'saddle', 'groin', 'perineum')),
      seq('numb', gap(4), oneOf('genitals', 'genital', 'anus', 'saddle', 'groin', 'perineum')),
      seq('saddle', oneOf('numbness', 'anaesthesia', 'anesthesia')),
      seq('numb between', gap(2), 'legs'),
      seq('weakness in both legs'),
      seq('both legs', gap(3), oneOf('weak', 'weakness', 'numb', 'giving', 'gave')),
    ],
  },
  {
    // §6 rule 10 — sudden cold/pale/pulseless painful limb; sudden severe
    // testicular pain and swelling.
    name: 'acute_limb_testicular_ischaemia',
    phrases: [
      seq('pulseless'),
      seq(oneOf('cold', 'pale', 'white'), gap(1), oneOf('pale', 'white', 'blue', 'mottled', 'pulseless', 'painful'), gap(2), LIMBS),
      seq(LIMBS, gap(4), 'cold', gap(3), oneOf('pale', 'white', 'blue', 'pulseless', 'numb', 'mottled')),
      seq(LIMBS, gap(4), oneOf('pale', 'white'), gap(3), oneOf('cold', 'pulseless')),
      seq(oneOf('testicular', 'testicle', 'testicles', 'scrotum', 'scrotal'), gap(3), oneOf('pain', 'painful', 'swelling', 'swollen')),
      seq(oneOf('pain', 'painful', 'swelling', 'swollen'), gap(3), oneOf('testicular', 'testicle', 'testicles', 'scrotum')),
      seq(oneOf('twisted', 'torsion'), gap(2), oneOf('testicle', 'testicles', 'testis')),
    ],
  },
  {
    // §6 rule 11 — plan, means, intent, has already taken an overdose.
    // "end of life" must never fire: a possessive token is required between
    // the verb and "life", so palliative-care wording is safe.
    name: 'self_harm_intent',
    phrases: [
      seq(oneOf('suicidal', 'suicide')),
      seq(oneOf('kill', 'killing', 'harm', 'harming', 'hurt', 'hurting', 'cut', 'cutting'), oneOf('myself', 'himself', 'herself', 'themselves')),
      seq('self harm'),
      seq(oneOf('end', 'ending', 'take', 'taking', 'taken'), gap(1), oneOf('my', 'his', 'her', 'their', 'own'), gap(1), 'life'),
      seq('plan to', oneOf('kill', 'end', 'harm', 'hurt', 'die')),
      seq(oneOf('taken', 'took', 'taking'), gap(2), 'overdose'),
      seq(oneOf('overdosed', 'overdosing')),
      seq(oneOf('want', 'wants', 'wanting'), 'to die'),
    ],
  },
  {
    // §6 rule 12 — heavy vaginal bleeding in pregnancy, severe abdominal
    // pain in pregnancy, reduced fetal movements.
    name: 'obstetric',
    phrases: [
      seq('heavy vaginal bleeding'),
      seq(oneOf('vaginal', 'vagina'), gap(3), oneOf('bleeding', 'bleed', 'blood')),
      seq('bleeding', gap(3), oneOf('vagina', 'vaginal')),
      seq(oneOf('bleeding', 'blood', 'bleed'), gap(4), oneOf('pregnant', 'pregnancy')),
      seq(oneOf('pregnant', 'pregnancy'), gap(4), oneOf('bleeding', 'bleed')),
      seq(oneOf('severe', 'bad', 'terrible'), gap(2), oneOf('abdominal', 'tummy', 'stomach', 'belly'), gap(1), 'pain', gap(3), oneOf('pregnancy', 'pregnant')),
      seq(oneOf('reduced', 'fewer', 'less', 'no'), gap(1), oneOf('fetal', 'foetal', 'baby'), gap(1), oneOf('movement', 'movements')),
      // Negator inside the span so "not felt the baby move" still fires.
      seq(oneOf('not', 'no'), gap(3), 'baby', gap(2), oneOf('move', 'moving', 'moved', 'movements')),
      seq('baby', gap(3), oneOf('stopped', 'not'), gap(1), oneOf('move', 'moving', 'moved')),
    ],
  },
  {
    // §6 rule 13 — vomiting with high blood sugar or high ketones, hypo not
    // responding to treatment, new severe drowsiness or acute confusion.
    name: 'metabolic',
    phrases: [
      seq('high ketones'),
      seq('ketones', gap(2), oneOf('high', 'raised', 'up')),
      seq(oneOf('vomiting', 'vomited', 'sick'), gap(6), 'ketones'),
      seq('ketones', gap(6), oneOf('vomiting', 'vomited', 'sick')),
      seq(oneOf('vomiting', 'vomited', 'sick'), gap(6), 'blood sugar'),
      seq('blood sugar', gap(6), oneOf('vomiting', 'vomited')),
      seq('hypo', gap(4), oneOf('responding', 'coming', 'come', 'improving', 'up')),
      seq(oneOf('severe', 'very', 'extremely', 'unusually', 'new'), gap(1), oneOf('drowsy', 'drowsiness', 'sleepy')),
      seq('acute confusion'),
      seq(oneOf('dka', 'ketoacidosis')),
    ],
  },
  {
    // §6 rule 14 — sudden painless loss of vision, severe eye pain with
    // halos and vomiting.
    name: 'acute_eye',
    phrases: [
      seq('painless loss of', oneOf('vision', 'sight')),
      seq(oneOf('severe', 'bad', 'terrible', 'awful'), gap(1), 'eye', oneOf('pain', 'ache')),
      seq('eye', oneOf('pain', 'ache'), gap(4), oneOf('halos', 'haloes', 'vomiting', 'sick', 'vomited')),
      seq(oneOf('halos', 'haloes')),
      seq('curtain', gap(3), oneOf('vision', 'sight', 'eye')),
    ],
  },
];

/**
 * Negation and tense guard (research/01 §6, prd.md §8.3): these token
 * sequences, or a four-digit year before 2025, within five tokens either
 * side of a match suppress it.
 */
const NEGATION_PHRASES: readonly (readonly string[])[] = [
  ['no'],
  ['not'],
  ['denies'],
  ['never'],
  ['without'],
  ['used', 'to'],
  ['previously'],
  ['history', 'of'],
  ['resolved'],
];

/** Spec-fixed at five tokens either side. Do not widen or narrow. */
const CONTEXT_WINDOW = 5;
const NEGATION_YEAR_CUTOFF = 2025;
/**
 * A four-digit token only counts as a past-tense year if it is plausibly a
 * year. Without this floor, "I walked 1500 steps and had chest pain" would
 * be silently suppressed — a false negative in an emergency halt, which is
 * the one direction this module must never fail in.
 */
const NEGATION_YEAR_FLOOR = 1900;

/** Longest negation phrase, used to widen the straddle search. */
const MAX_NEGATION_PHRASE_LENGTH = NEGATION_PHRASES.reduce(
  (max, phrase) => Math.max(max, phrase.length),
  1,
);

function tokenize(text: string): Token[] {
  // Curly apostrophes are normalised to ASCII so "can’t" tokenizes as one
  // word, exactly like "can't". Length is preserved, so token offsets still
  // index into the original text for `matchedText`.
  const normalised = text.replace(/[‘’ʼ′]/g, "'");
  const tokens: Token[] = [];
  const re = /[A-Za-z0-9']+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalised)) !== null) {
    tokens.push({
      word: match[0].toLowerCase(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * Attempts to match `phrase` starting at token `startIndex`. Returns the
 * inclusive end token index of the shortest match, or null.
 */
function matchPhraseAt(
  tokens: readonly Token[],
  phrase: Phrase,
  startIndex: number,
): number | null {
  function walk(partIndex: number, tokenIndex: number): number | null {
    if (partIndex === phrase.length) return tokenIndex - 1;
    const part: PhrasePart | undefined = phrase[partIndex];
    if (part === undefined) return null;
    if (part.kind === 'skip') {
      for (let skipped = 0; skipped <= part.max; skipped++) {
        if (tokenIndex + skipped > tokens.length) break;
        const end = walk(partIndex + 1, tokenIndex + skipped);
        if (end !== null) return end;
      }
      return null;
    }
    const token = tokens[tokenIndex];
    if (token === undefined) return null;
    const word = token.word;
    const matches = part.kind === 'word' ? word === part.word : part.words.includes(word);
    return matches ? walk(partIndex + 1, tokenIndex + 1) : null;
  }
  return walk(0, startIndex);
}

function isSuppressingYear(word: string): boolean {
  if (!/^\d{4}$/.test(word)) return false;
  const year = Number(word);
  return year >= NEGATION_YEAR_FLOOR && year < NEGATION_YEAR_CUTOFF;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * True if a negation/tense guard token sits within five tokens either side
 * of the matched span.
 *
 * Two subtleties, both deliberate:
 *
 *  1. Guard occurrences that overlap the matched span itself are ignored.
 *     Otherwise phrases that *contain* a negator by design — "passing no
 *     urine", "hypo not responding to treatment", "not waking after a
 *     seizure" — would suppress themselves.
 *  2. A multi-token guard ("used to", "history of") counts if *any* of its
 *     tokens falls inside the five-token window, so the guard is still found
 *     when it straddles the window edge. Searching only the sliced window
 *     would miss "used to" whose "used" sits one token outside it.
 */
function isNegated(
  tokens: readonly Token[],
  startIndex: number,
  endIndex: number,
): boolean {
  const beforeStart = startIndex - CONTEXT_WINDOW;
  const beforeEnd = startIndex - 1;
  const afterStart = endIndex + 1;
  const afterEnd = endIndex + CONTEXT_WINDOW;

  for (let i = Math.max(0, beforeStart); i <= Math.min(tokens.length - 1, afterEnd); i++) {
    if (i >= startIndex && i <= endIndex) continue;
    const token = tokens[i];
    if (token !== undefined && isSuppressingYear(token.word)) return true;
  }

  const searchFrom = Math.max(0, beforeStart - (MAX_NEGATION_PHRASE_LENGTH - 1));
  const searchTo = Math.min(tokens.length - 1, afterEnd + (MAX_NEGATION_PHRASE_LENGTH - 1));

  for (const guard of NEGATION_PHRASES) {
    for (let i = searchFrom; i + guard.length - 1 <= searchTo; i++) {
      let matches = true;
      for (let j = 0; j < guard.length; j++) {
        if (tokens[i + j]?.word !== guard[j]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      const guardStart = i;
      const guardEnd = i + guard.length - 1;
      if (rangesOverlap(guardStart, guardEnd, startIndex, endIndex)) continue;
      if (
        rangesOverlap(guardStart, guardEnd, beforeStart, beforeEnd) ||
        rangesOverlap(guardStart, guardEnd, afterStart, afterEnd)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Scans concern / free-text input for the fourteen deterministic red-flag
 * rules. Returns the first non-negated hit found in the text (leftmost
 * match wins across all rules; on a tie the longer span wins so the halt
 * card can quote the fuller phrase), or null if none fire.
 *
 * Never pass document text to this function. See module doc comment.
 */
export function scanRedFlags(text: string): RedFlagHit | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  let best: { rule: string; startIndex: number; endIndex: number } | null = null;

  for (const rule of RULES) {
    for (const phrase of rule.phrases) {
      for (let i = 0; i < tokens.length; i++) {
        const endIndex = matchPhraseAt(tokens, phrase, i);
        if (endIndex === null) continue;
        if (isNegated(tokens, i, endIndex)) continue;
        if (
          best === null ||
          i < best.startIndex ||
          (i === best.startIndex && endIndex > best.endIndex)
        ) {
          best = { rule: rule.name, startIndex: i, endIndex };
        }
      }
    }
  }

  if (best === null) return null;

  const startToken = tokens[best.startIndex];
  const endToken = tokens[best.endIndex];
  /* c8 ignore next -- unreachable: both indices come from a completed match */
  if (startToken === undefined || endToken === undefined) return null;
  return {
    rule: best.rule,
    matchedText: text.slice(startToken.start, endToken.end),
  };
}
