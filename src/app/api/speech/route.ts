import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { MAX_SPEECH_CHARS, TooFastError, speechFor } from "@/lib/tts/speak";

export const maxDuration = 120;

// Making speech uses the AI's free allowance, so each person may ask for only so many NEW clips a minute (clips already stored are free and unlimited).
// Letter sounds have their own, larger allowance: there are only a few dozen, each is stored for good, and a lesson fetches several at once.
const MAX_PER_MINUTE = { phrase: 12, sound: 60 };
const recent = new Map<string, number[]>();

function tooFast(userId: string, kind: "phrase" | "sound"): boolean {
  const now = Date.now();
  const key = `${kind}:${userId}`;
  const times = (recent.get(key) ?? []).filter((t) => now - t < 60_000);
  times.push(now);
  recent.set(key, times);
  return times.length > MAX_PER_MINUTE[kind];
}

/**
 * The spoken (WAV) version of a text, in a child-friendly voice, for the
 * study pack's Read aloud buttons. Body: { text, language }.
 */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const language = typeof body?.language === "string" && /^[a-z]{2}$/.test(body.language) ? body.language : "en";
  const kind = body?.kind === "sound" ? "sound" : "phrase";
  if (!text) return apiError(400, "There is no text to read aloud.");
  if (kind === "sound" && text.length > 12) return apiError(400, "A letter sound is only a few characters.");
  if (text.length > MAX_SPEECH_CHARS) return apiError(400, `This is too long to read aloud in one go (more than ${MAX_SPEECH_CHARS} characters). Read it in parts.`);

  try {
    const { wav, fromCache } = await speechFor(
      text,
      language,
      () => {
        if (tooFast(auth.account.id, kind)) throw new TooFastError();
      },
      kind
    );
    return new NextResponse(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        "Cache-Control": "private, max-age=86400",
        "X-Speech-Cached": fromCache ? "1" : "0",
      },
    });
  } catch (err) {
    return errorResponse(err, "speech", "Couldn't make the voice just now. The device's own voice will be used instead.");
  }
}
