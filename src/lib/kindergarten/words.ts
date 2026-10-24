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
    { word: "bat", emoji: "🏏" },
    { word: "rat", emoji: "🐀" },
    { word: "hat", emoji: "🎩" },
    { word: "bag", emoji: "👜" },
    { word: "cap", emoji: "🧢" },
    { word: "van", emoji: "🚐" },
    { word: "map", emoji: "🗺️" },
    { word: "man", emoji: "👨" },
    { word: "fat", emoji: null },
    { word: "mat", emoji: null },
    { word: "pat", emoji: null },
    { word: "sat", emoji: null },
    { word: "ban", emoji: "🚫" },
    { word: "can", emoji: "🥫" },
    { word: "fan", emoji: null },
    { word: "pan", emoji: "🍳" },
    { word: "ran", emoji: null },
    { word: "tan", emoji: null },
    { word: "gap", emoji: null },
    { word: "lap", emoji: null },
    { word: "nap", emoji: "😴" },
    { word: "rap", emoji: null },
    { word: "sap", emoji: null },
    { word: "tap", emoji: "🚰" },
    { word: "rag", emoji: null },
    { word: "tag", emoji: "🏷️" },
    { word: "wag", emoji: null },
    { word: "bad", emoji: null },
    { word: "dad", emoji: null },
    { word: "mad", emoji: "😠" },
    { word: "sad", emoji: "😢" },
    { word: "dam", emoji: null },
    { word: "ham", emoji: "🍖" },
    { word: "jam", emoji: "🍯" },
    { word: "ram", emoji: "🐏" },
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
    { word: "pet", emoji: null },
    { word: "bet", emoji: null },
    { word: "get", emoji: null },
    { word: "let", emoji: null },
    { word: "set", emoji: null },
    { word: "vet", emoji: null },
    { word: "wet", emoji: "💧" },
    { word: "den", emoji: null },
    { word: "men", emoji: null },
    { word: "ten", emoji: "🔟" },
    { word: "fed", emoji: null },
    { word: "red", emoji: "🔴" },
    { word: "wed", emoji: null },
    { word: "beg", emoji: null },
    { word: "peg", emoji: null },
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
    { word: "sit", emoji: null },
    { word: "fin", emoji: null },
    { word: "tin", emoji: null },
    { word: "win", emoji: "🏆" },
    { word: "bit", emoji: null },
    { word: "kit", emoji: "🧰" },
    { word: "lit", emoji: null },
    { word: "pit", emoji: null },
    { word: "dip", emoji: null },
    { word: "rip", emoji: null },
    { word: "sip", emoji: null },
    { word: "tip", emoji: null },
    { word: "zip", emoji: "🤐" },
    { word: "big", emoji: null },
    { word: "dig", emoji: "⛏️" },
    { word: "fig", emoji: null },
    { word: "wig", emoji: null },
    { word: "lid", emoji: null },
    { word: "mix", emoji: null },
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
    { word: "cot", emoji: null },
    { word: "got", emoji: null },
    { word: "lot", emoji: null },
    { word: "not", emoji: null },
    { word: "rot", emoji: null },
    { word: "cop", emoji: "👮" },
    { word: "hop", emoji: "🐸" },
    { word: "mop", emoji: "🧹" },
    { word: "pop", emoji: null },
    { word: "bog", emoji: null },
    { word: "fog", emoji: "🌫️" },
    { word: "hog", emoji: "🐗" },
    { word: "bob", emoji: null },
    { word: "job", emoji: "💼" },
    { word: "sob", emoji: null },
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
    { word: "dug", emoji: null },
    { word: "hug", emoji: "🤗" },
    { word: "jug", emoji: null },
    { word: "mug", emoji: null },
    { word: "pug", emoji: null },
    { word: "rug", emoji: null },
    { word: "tug", emoji: null },
    { word: "bun", emoji: null },
    { word: "fun", emoji: null },
    { word: "nun", emoji: null },
    { word: "but", emoji: null },
    { word: "cut", emoji: "✂️" },
    { word: "rut", emoji: null },
    { word: "sub", emoji: null },
    { word: "gum", emoji: null },
    { word: "hum", emoji: null },
    { word: "mum", emoji: null },
    { word: "sum", emoji: "➕" },
  ],
};

/** The word family (rime) of a CVC word: "cat" is in "at". */
export const rimeOf = (word: string) => word.slice(1);

/** The families of a vowel with at least three words, biggest first ("at", "an", "ap"...), so a child can practise one rhyming set at a time. */
export function familiesOf(vowel: Vowel): string[] {
  const counts = new Map<string, number>();
  for (const { word } of CVC_WORDS[vowel]) counts.set(rimeOf(word), (counts.get(rimeOf(word)) ?? 0) + 1);
  return [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([rime]) => rime);
}

/**
 * The sight words: the Dolch words in the order children usually learn them,
 * as five sets of 40 (from the school's printed Dolch lists, pages 1 to 5),
 * plus the school's CVC list to read at sight.
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
  // The CVC and "oy" words on the school's list, to read at sight.
  school: ["cat", "map", "pod", "rub", "jog", "fit", "sin", "sun", "keg", "cub", "dot", "hut", "toy", "fix", "hit", "run", "joy"],
} as const;

export type SightLevel = keyof typeof SIGHT_SETS;
export const SIGHT_LEVELS = Object.keys(SIGHT_SETS) as SightLevel[];
export const SIGHT_LEVEL_LABELS: Record<SightLevel, string> = {
  set1: "Set 1 (the, was, at)",
  set2: "Set 2 (do, get, big)",
  set3: "Set 3 (from, put, away)",
  set4: "Set 4 (walk, stop, tell)",
  set5: "Set 5 (soon, our, use)",
  school: "School CVC list (cat, map, pod)",
};

/** What is counted in "more, less or same" questions. */
export const COUNT_EMOJI = ["🍎", "⭐", "🐟", "🎈", "🐥", "🌸", "🚗", "🍪"] as const;

/**
 * More real CVC words per vowel, for games that need many words and no
 * pictures (the board game). All three letters, consonant-vowel-consonant.
 */
export const BOARD_WORDS: Record<Vowel, string[]> = {
  a: "bag bat cab can cap cat dad fan gap ham had hat jab jam lap mad man map mat nap pan pat rag ram rat sad sag sat tab tag tan tap van wag yap".split(" "),
  e: "bed beg den get hen jet keg leg men met net peg pen pet red set ten vet web wet yes".split(" "),
  i: "big bin bit dig dip fig fit fix hid him hip hit kid kit lid lip mix pig pin rip sin sit six tin wig win zip".split(" "),
  o: "box cop cot dog dot fox got hop hot job jog lot mop nod pod pop pot rod rot sob top".split(" "),
  u: "bud bug bus but cub cup cut dug fun gum hug hut jug mud mug nut pug rub rug run sun tub tug".split(" "),
};
