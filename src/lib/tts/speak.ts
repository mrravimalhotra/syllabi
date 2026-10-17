// Child-friendly read-aloud voice, made with Gemini's speech model (same
// Google key, free tier) and kept in storage so each text is made only once.

import { createHash } from "node:crypto";
import { downloadFile, uploadSourceFile } from "@/lib/storage";
import { assertHeaderSafe } from "@/lib/llm/assert-header-safe";
import { withNetworkRetry, fetchOrThrowTransient } from "@/lib/llm/retry";
import { pcmToWav, splitForSpeech } from "@/lib/tts/wav";
import { UserError } from "@/lib/errors";

/** Longest text read aloud in one request: a study-pack part or answer is far shorter. */
export const MAX_SPEECH_CHARS = 2_500;

// A young, upbeat female voice. Others to try (all female): Aoede (breezy), Laomedeia (upbeat), Sulafat (warm), Zephyr (bright).
const DEFAULT_VOICE = "Leda";
const DEFAULT_MODEL = "gemini-2.5-flash-preview-tts";

const voice = () => process.env.TTS_VOICE?.trim() || DEFAULT_VOICE;
const model = () => process.env.TTS_MODEL?.trim() || DEFAULT_MODEL;

/** How to speak, in words, since the speech model follows a spoken-style instruction. */
function styleFor(language: string): string {
  if (language === "hi" || language === "mr") {
    return "Say this warmly and cheerfully, like a kind primary-school teacher talking to a child, at an easy pace:";
  }
  if (language === "fr") return "Say this warmly and cheerfully, like a kind teacher talking to a child, at an easy pace:";
  return "Say this warmly and cheerfully, like a kind Indian primary-school teacher talking to a child, with a natural Indian English accent and an easy pace:";
}

const cacheKey = (text: string, language: string) =>
  `speech/${createHash("sha256").update(JSON.stringify([model(), voice(), language, text])).digest("hex").slice(0, 40)}.wav`;

async function synthesizeOne(text: string, language: string): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");
  assertHeaderSafe("GOOGLE_API_KEY", apiKey);

  const response = await withNetworkRetry(() =>
    fetchOrThrowTransient(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${styleFor(language)} ${text}` }] }],
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
export async function speechFor(text: string, language: string): Promise<{ wav: Buffer; fromCache: boolean }> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new UserError("There is nothing to read aloud here.");
  const key = cacheKey(clean, language);

  const stored = await downloadFile(key).catch(() => null);
  if (stored) return { wav: stored.data, fromCache: true };

  const pcm = Buffer.concat(await Promise.all(splitForSpeech(clean).map((piece) => synthesizeOne(piece, language))));
  const wav = pcmToWav(pcm);
  // Saving is for next time; a storage hiccup must not stop this reply.
  await uploadSourceFile(key, wav, "audio/wav").catch((err) => console.error("[speech] couldn't save the audio", err));
  return { wav, fromCache: false };
}
