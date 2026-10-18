// Letter sounds recorded by the grown-up (in the voice the child's school
// uses), kept privately per account, and played instead of the speech voice.

export const MAX_SOUND_BYTES = 400_000;
const AUDIO_TYPES = /^audio\/(webm|mp4|mpeg|ogg|wav|x-m4a|aac|x-wav|mp3)(;.*)?$/i;

/** Where one account's recording of one letter is stored. */
export const soundKey = (ownerId: string, letter: string) => `sounds/${ownerId}/${letter}`;

export const isLetter = (value: unknown): value is string => typeof value === "string" && /^[a-z]$/.test(value);
export const isAudioType = (type: string | null) => Boolean(type && AUDIO_TYPES.test(type));
