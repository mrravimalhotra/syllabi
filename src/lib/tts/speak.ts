// Child-friendly read-aloud voice, made with Gemini's speech model (same
// Google key, free tier) and kept in storage so each text is made only once.

import { createHash } from "node:crypto";
import { downloadFile, uploadSourceFile } from "@/lib/storage";
import { assertHeaderSafe } from "@/lib/llm/assert-header-safe";
import { withNetworkRetry, fetchOrThrowTransient } from "@/lib/llm/retry";
import { pcmToWav, splitForSpeech } from "@/lib/tts/wav";
import { UserError } from "@/lib/errors";

/** Too many new voice clips asked for too quickly (each one uses the AI's free allowance). */
export class TooFastError extends UserError {
  constructor() {
    super("The voice is being asked for very quickly. Wait a few seconds and try again.");
  }
}

/** Longest text read aloud in one request: a study-pack part or answer is far shorter. */
export const MAX_SPEECH_CHARS = 2_500;

// A young, upbeat female voice. Others to try (all female): Aoede (breezy), Laomedeia (upbeat), Sulafat (warm), Zephyr (bright).
const DEFAULT_VOICE = "Leda";
const DEFAULT_MODEL = "gemini-2.5-flash-preview-tts";

const voice = () => process.env.TTS_VOICE?.trim() || DEFAULT_VOICE;
const model = () => process.env.TTS_MODEL?.trim() || DEFAULT_MODEL;

/** How to speak, in words, since the speech model follows a spoken-style instruction. */
function styleFor(language: string, kind: SpeechKind): string {
  // A single letter sound, spoken the way a phonics teacher says it.
  if (kind === "sound") {
    return "Say only this one speech sound, as a phonics teacher says the sound a letter makes: clean and quick, with no extra vowel added after it, and never the name of the letter:";
  }
  if (language === "hi" || language === "mr") {
    return "Say this warmly and cheerfully, like a kind primary-school teacher talking to a child, at an easy pace:";
  }
  if (language === "fr") return "Say this warmly and cheerfully, like a kind teacher talking to a child, at an easy pace:";
  return "Say this warmly and cheerfully, like a kind Indian primary-school teacher talking to a child, with a natural Indian English accent and an easy pace:";
}

/** A phrase read aloud, or one letter sound (spoken in a different style). */
export type SpeechKind = "phrase" | "sound";

const cacheKey = (text: string, language: string, kind: SpeechKind) =>
  `speech/${createHash("sha256").update(JSON.stringify([model(), voice(), language, text, ...(kind === "sound" ? ["sound"] : [])])).digest("hex").slice(0, 40)}.wav`;

async function synthesizeOne(text: string, language: string, kind: SpeechKind): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");
  assertHeaderSafe("GOOGLE_API_KEY", apiKey);

  const response = await withNetworkRetry(() =>
    fetchOrThrowTransient(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${styleFor(language, kind)} ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice() } } },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    })
  );
  if (!response.ok) throw new Error(`Gemini speech failed (${response.status}): ${(await response.text()).slice(0, 300)}`);

  const data = (await response.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Gemini speech returned no audio");
  return Buffer.from(part.inlineData.data, "base64");
}

/**
 * The spoken version of a text as WAV audio. A text spoken before comes
 * straight from storage; a new one is made (in pieces if long) and saved.
 */
export async function speechFor(
  text: string,
  language: string,
  /** Called only when a new clip must be made (not for one already stored); may throw to refuse. */
  beforeMaking?: () => void,
  kind: SpeechKind = "phrase"
): Promise<{ wav: Buffer; fromCache: boolean }> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new UserError("There is nothing to read aloud here.");
  const key = cacheKey(clean, language, kind);

  const stored = await downloadFile(key).catch(() => null);
  if (stored) return { wav: stored.data, fromCache: true };

  beforeMaking?.();
  const pcm = Buffer.concat(await Promise.all(splitForSpeech(clean).map((piece) => synthesizeOne(piece, language, kind))));
  const wav = pcmToWav(pcm);
  // Saving is for next time; a storage hiccup must not stop this reply.
  await uploadSourceFile(key, wav, "audio/wav").catch((err) => console.error("[speech] couldn't save the audio", err));
  return { wav, fromCache: false };
}
