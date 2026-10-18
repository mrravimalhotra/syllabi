// Word lists for the kindergarten activities. Every CVC word is three letters
// (consonant, vowel, consonant), has one clear picture, and is grouped by its
// vowel sound. The sight words are the Dolch words the school uses (200 words in
// five sets), the common words children learn to recognise at a glance.

export const VOWELS = ["a", "e", "i", "o", "u"] as const;
export type Vowel = (typeof VOWELS)[number];

export interface CvcWord {
  word: string;
  /** One clear picture of the word, or null when no picture shows it clearly (the child hears it instead). */
  emoji: string | null;
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
    { word: "keg", emoji: "🛢️" },
  ],
  i: [
    { word: "pig", emoji: "🐷" },
    { word: "pin", emoji: "📌" },
    { word: "lip", emoji: "👄" },
    { word: "kid", emoji: "🧒" },
    { word: "six", emoji: "6️⃣" },
    { word: "bin", emoji: "🗑️" },
    { word: "fit", emoji: "💪" },
    { word: "fix", emoji: "🔧" },
    { word: "hit", emoji: null },
    { word: "sin", emoji: null },
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
    { word: "pod", emoji: null },
    { word: "jog", emoji: null },
  ],
  u: [
    { word: "sun", emoji: "☀️" },
    { word: "bug", emoji: "🐛" },
    { word: "bus", emoji: "🚌" },
    { word: "nut", emoji: "🥜" },
    { word: "hut", emoji: "🛖" },
    { word: "cup", emoji: "☕" },
    { word: "tub", emoji: "🛁" },
    { word: "cub", emoji: "🐻" },
    { word: "run", emoji: "🏃" },
    { word: "rub", emoji: null },
  ],
};

/**
 * The sight words (Dolch words, in the order children usually learn them),
 * as five sets of 40. From the school's printed Dolch lists, pages 1 to 5.
 */
export const SIGHT_SETS = {
  set1: [
    "the", "was", "at", "out", "to", "said", "him", "as", "and", "his",
    "with", "be", "he", "that", "up", "have", "a", "she", "all", "go",
    "I", "for", "look", "we", "you", "on", "is", "am", "it", "they",
    "her", "then", "of", "but", "there", "little", "in", "had", "some", "down",
  ],
  set2: [
    "do", "get", "big", "very", "can", "them", "went", "an", "could", "like",
    "are", "over", "when", "one", "come", "your", "did", "this", "if", "its",
    "what", "my", "now", "ride", "so", "would", "long", "into", "see", "me",
    "no", "just", "not", "will", "came", "blue", "were", "yes", "ask", "red",
  ],
  set3: [
    "from", "put", "away", "ran", "good", "too", "old", "let", "any", "got",
    "by", "help", "about", "take", "their", "make", "around", "where", "here", "going",
    "want", "every", "saw", "sleep", "don't", "pretty", "call", "brown", "how", "jump",
    "after", "yellow", "know", "green", "well", "five", "right", "four", "think", "six",
  ],
  set4: [
    "walk", "stop", "tell", "black", "two", "off", "much", "white", "or", "never",
    "keep", "ten", "before", "seven", "give", "does", "eat", "eight", "work", "bring",
    "again", "cold", "first", "goes", "play", "today", "try", "write", "who", "fly",
    "new", "always", "been", "myself", "must", "drink", "may", "round", "start", "once",
  ],
  set5: [
    "soon", "our", "use", "sit", "made", "better", "fast", "which", "run", "hold",
    "say", "fall", "gave", "buy", "light", "carry", "open", "funny", "pick", "small",
    "has", "warm", "hurt", "under", "find", "ate", "pull", "read", "only", "full",
    "cut", "why", "us", "those", "kind", "own", "three", "done", "both", "found",
  ],
} as const;

export type SightLevel = keyof typeof SIGHT_SETS;
export const SIGHT_LEVELS = Object.keys(SIGHT_SETS) as SightLevel[];
export const SIGHT_LEVEL_LABELS: Record<SightLevel, string> = {
  set1: "Set 1 (the, was, at)",
  set2: "Set 2 (do, get, big)",
  set3: "Set 3 (from, put, away)",
  set4: "Set 4 (walk, stop, tell)",
  set5: "Set 5 (soon, our, use)",
};

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
