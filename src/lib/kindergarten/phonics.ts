// How the letter sounds are taught and spoken, following common phonics
// practice (Jolly Phonics, Letters and Sounds and similar schemes):
//   - say the SOUND a letter makes, never its name;
//   - "continuous" sounds (m, s, f, n, l, r, v, z) can be held and stretched;
//   - "stop" sounds (b, d, g, k, p, t...) are quick and clipped, with no
//     added "uh" (say "b", not "buh");
//   - short vowels have a keyword picture (a as in apple);
//   - to blend, touch each letter and say its sound, then glide the sounds
//     together, slowly at first and then faster, until they make the word.
// A speech voice can only approximate a pure sound from a spelling, so the app
// also plays recorded sounds when files are provided (public/sounds/README.md).

type SoundKind = "vowel" | "continuous" | "stop";

export interface Phoneme {
  kind: SoundKind;
  /** What the speech voice says for this sound. */
  say: string;
  /** Said when stretching a continuous sound while blending ("mmm" held longer). */
  hold: string;
  /** How to make the sound, for the grown-up. */
  tip: string;
  /** A picture word that starts with the sound. */
  keyword: { word: string; emoji: string };
}

export const PHONEMES: Record<string, Phoneme> = {
  a: { kind: "vowel", say: "aah", hold: "aaah", tip: "Open your mouth wide: a as in apple.", keyword: { word: "apple", emoji: "🍎" } },
  b: { kind: "stop", say: "buh", hold: "buh", tip: "Lips pop together with your voice. Keep it quick: b, not buh.", keyword: { word: "ball", emoji: "⚽" } },
  c: { kind: "stop", say: "kuh", hold: "kuh", tip: "The back of your tongue pops, no voice. Quick: k, not kuh.", keyword: { word: "cat", emoji: "🐱" } },
  d: { kind: "stop", say: "duh", hold: "duh", tip: "Tongue taps behind your top teeth, with voice. Quick: d.", keyword: { word: "dog", emoji: "🐶" } },
  e: { kind: "vowel", say: "eh", hold: "eeh", tip: "Mouth half open: e as in egg.", keyword: { word: "egg", emoji: "🥚" } },
  f: { kind: "continuous", say: "fff", hold: "ffff", tip: "Top teeth on your bottom lip and blow: fff. You can hold it.", keyword: { word: "fish", emoji: "🐟" } },
  g: { kind: "stop", say: "guh", hold: "guh", tip: "The back of your tongue pops, with voice. Quick: g.", keyword: { word: "goat", emoji: "🐐" } },
  h: { kind: "stop", say: "hhh", hold: "hhh", tip: "Breathe out like fogging a mirror: h. Quick.", keyword: { word: "hat", emoji: "🎩" } },
  i: { kind: "vowel", say: "ih", hold: "iih", tip: "Smile a little, mouth nearly closed: i as in ink.", keyword: { word: "ink", emoji: "🖋️" } },
  j: { kind: "stop", say: "juh", hold: "juh", tip: "Lips round, a quick j.", keyword: { word: "jet", emoji: "✈️" } },
  k: { kind: "stop", say: "kuh", hold: "kuh", tip: "The back of your tongue pops, no voice. Quick: k.", keyword: { word: "kite", emoji: "🪁" } },
  l: { kind: "continuous", say: "lll", hold: "llll", tip: "Tongue tip behind your top teeth, voice on: lll. You can hold it.", keyword: { word: "lion", emoji: "🦁" } },
  m: { kind: "continuous", say: "mmm", hold: "mmmm", tip: "Lips together and hum: mmm. You can hold it, with no uh.", keyword: { word: "monkey", emoji: "🐒" } },
  n: { kind: "continuous", say: "nnn", hold: "nnnn", tip: "Tongue behind your top teeth and hum through your nose: nnn.", keyword: { word: "nut", emoji: "🥜" } },
  o: { kind: "vowel", say: "ah", hold: "aah", tip: "Mouth round and open: o as in octopus.", keyword: { word: "octopus", emoji: "🐙" } },
  p: { kind: "stop", say: "puh", hold: "puh", tip: "Lips pop together, no voice. Quick: p, not puh.", keyword: { word: "pig", emoji: "🐷" } },
  q: { kind: "stop", say: "kwuh", hold: "kwuh", tip: "Q and U go together: kw.", keyword: { word: "queen", emoji: "👑" } },
  r: { kind: "continuous", say: "rrr", hold: "rrrr", tip: "Lips a little round, tongue pulled back: rrr like a growl.", keyword: { word: "rabbit", emoji: "🐇" } },
  s: { kind: "continuous", say: "sss", hold: "ssss", tip: "Teeth together and hiss like a snake: sss. You can hold it.", keyword: { word: "sun", emoji: "☀️" } },
  t: { kind: "stop", say: "tuh", hold: "tuh", tip: "Tongue taps behind your top teeth, no voice. Quick: t.", keyword: { word: "tiger", emoji: "🐯" } },
  u: { kind: "vowel", say: "uh", hold: "uuh", tip: "Relaxed mouth: u as in umbrella.", keyword: { word: "umbrella", emoji: "☂️" } },
  v: { kind: "continuous", say: "vvv", hold: "vvvv", tip: "Top teeth on your bottom lip and buzz: vvv.", keyword: { word: "van", emoji: "🚐" } },
  w: { kind: "stop", say: "wuh", hold: "wuh", tip: "Lips round like blowing a candle, then open: w.", keyword: { word: "web", emoji: "🕸️" } },
  x: { kind: "stop", say: "ks", hold: "ks", tip: "A k and an s together: ks, as at the end of box.", keyword: { word: "box", emoji: "📦" } },
  y: { kind: "stop", say: "yuh", hold: "yuh", tip: "The y at the start of yes. Quick.", keyword: { word: "yak", emoji: "🦬" } },
  z: { kind: "continuous", say: "zzz", hold: "zzzz", tip: "Teeth together and buzz like a bee: zzz.", keyword: { word: "zebra", emoji: "🦓" } },
};

/** The sound of a letter, for the speech voice: stretched when `slow` and the sound can be held. */
export function soundText(letter: string, slow = false): string {
  const p = PHONEMES[letter];
  if (!p) return letter;
  return slow && p.kind !== "stop" ? p.hold : p.say;
}

/**
 * How a letter's sound is written when a word is sounded out, as the school
 * does: k a t = cat. The letter c says /k/ in every CVC word.
 */
export const phoneLabel = (letter: string) => (letter === "c" ? "k" : letter);

export const isVowel = (letter: string) => PHONEMES[letter]?.kind === "vowel";

/** The order many schemes teach letters in (s a t p i n first), so the earliest words can be read soonest. */
export const TEACHING_ORDER = "satpinmdgockeurhbfljvwxyzq".split("");
