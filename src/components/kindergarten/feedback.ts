// Colours and timing shared by the kindergarten games. Green is only ever a
// right answer and red only a mistake, so letters use other colours: vowels
// amber, consonants blue.

export const VOWEL_TEXT = "text-amber-600";
export const CONSONANT_TEXT = "text-brand-700";
export const RIGHT_CARD = "border-emerald-500 bg-emerald-50";
export const WRONG_CARD = "border-red-500 bg-red-50";

/** The quiet between letter sounds, so each is heard on its own (m … a … p). */
export const SOUND_GAP_MS = 350;

export const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
