// Word lists for the kindergarten activities. Every CVC word is three letters
// (consonant, vowel, consonant), has one clear picture, and is grouped by its
// vowel sound. The sight words are the standard early-reader lists (pre-primer
// and primer), the first words children learn to recognise at a glance.

export const VOWELS = ["a", "e", "i", "o", "u"] as const;
export type Vowel = (typeof VOWELS)[number];

export interface CvcWord {
  word: string;
  /** One clear picture of the word. */
  emoji: string;
}

export const CVC_WORDS: Record<Vowel, CvcWord[]> = {
  a: [
    { word: "cat", emoji: "🐱" },
    { word: "bat", emoji: "🦇" },
    { word: "rat", emoji: "🐀" },
    { word: "hat", emoji: "🎩" },
    { word: "bag", emoji: "👜" },
    { word: "cap", emoji: "🧢" },
    { word: "van", emoji: "🚐" },
    { word: "map", emoji: "🗺️" },
  ],
  e: [
    { word: "hen", emoji: "🐔" },
    { word: "pen", emoji: "🖊️" },
    { word: "bed", emoji: "🛏️" },
    { word: "net", emoji: "🥅" },
    { word: "jet", emoji: "✈️" },
    { word: "web", emoji: "🕸️" },
    { word: "leg", emoji: "🦵" },
  ],
  i: [
    { word: "pig", emoji: "🐷" },
    { word: "pin", emoji: "📌" },
    { word: "lip", emoji: "👄" },
    { word: "kid", emoji: "🧒" },
    { word: "six", emoji: "6️⃣" },
    { word: "bin", emoji: "🗑️" },
  ],
  o: [
    { word: "dog", emoji: "🐶" },
    { word: "fox", emoji: "🦊" },
    { word: "box", emoji: "📦" },
    { word: "log", emoji: "🪵" },
    { word: "hot", emoji: "🔥" },
    { word: "pot", emoji: "🍲" },
    { word: "dot", emoji: "⚫" },
    { word: "top", emoji: "🔝" },
  ],
  u: [
    { word: "sun", emoji: "☀️" },
    { word: "bug", emoji: "🐛" },
    { word: "bus", emoji: "🚌" },
    { word: "nut", emoji: "🥜" },
    { word: "hut", emoji: "🛖" },
    { word: "cup", emoji: "☕" },
    { word: "tub", emoji: "🛁" },
  ],
};

/** The Dolch pre-primer list: the first sight words, for the youngest readers. */
export const SIGHT_PRE_PRIMER = [
  "a", "and", "away", "big", "blue", "can", "come", "down", "find", "for", "funny", "go", "help", "here", "I", "in", "is", "it", "jump", "little",
  "look", "make", "me", "my", "not", "one", "play", "red", "run", "said", "see", "the", "three", "to", "two", "up", "we", "where", "yellow", "you",
];

/** The Dolch primer list: the next step. */
export const SIGHT_PRIMER = [
  "all", "am", "are", "at", "ate", "be", "black", "brown", "but", "came", "did", "do", "eat", "four", "get", "good", "have", "he", "into", "like",
  "must", "new", "no", "now", "on", "our", "out", "please", "pretty", "ran", "ride", "saw", "say", "she", "so", "soon", "that", "there", "they", "this",
  "too", "under", "want", "was", "well", "went", "what", "white", "who", "will", "with", "yes",
];

export type SightLevel = "pre-primer" | "primer";
export const SIGHT_LEVEL_LABELS: Record<SightLevel, string> = { "pre-primer": "First words", primer: "Next words" };

/** What is counted in "more, less or same" questions. */
export const COUNT_EMOJI = ["🍎", "⭐", "🐟", "🎈", "🐥", "🌸", "🚗", "🍪"] as const;

/**
 * How each letter is spoken when sounding a word out ("m, a, p, map"): the
 * short sound the letter makes, not its name. Written as plain spellings a
 * speech voice reads naturally, so they can be tuned here in one place.
 */
export const LETTER_SOUNDS: Record<string, string> = {
  a: "aah",
  b: "buh",
  c: "kuh",
  d: "duh",
  e: "eh",
  f: "fff",
  g: "guh",
  h: "hhh",
  i: "ih",
  j: "juh",
  k: "kuh",
  l: "lll",
  m: "mmm",
  n: "nnn",
  o: "ah",
  p: "puh",
  q: "kwuh",
  r: "rrr",
  s: "sss",
  t: "tuh",
  u: "uh",
  v: "vvv",
  w: "wuh",
  x: "ks",
  y: "yuh",
  z: "zzz",
};

export const isVowelLetter = (letter: string) => (VOWELS as readonly string[]).includes(letter);
