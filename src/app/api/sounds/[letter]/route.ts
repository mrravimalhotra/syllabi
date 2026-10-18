import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { MAX_SOUND_BYTES, isAudioType, isLetter, soundKey } from "@/lib/kindergarten/recordings";
import { deletePrefix, downloadFile, uploadSourceFile } from "@/lib/storage";

type Params = { params: Promise<{ letter: string }> };

/** The caller's recorded sound for one letter, as audio. */
export async function GET(_request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { letter } = await params;
  if (!isLetter(letter)) return apiError(404, "That isn't a letter.");
  try {
    const file = await downloadFile(soundKey(auth.account.id, letter)).catch(() => null);
    if (!file) return apiError(404, "No recording for this letter yet.");
    return new NextResponse(new Uint8Array(file.data), {
      headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err, "sounds GET letter", "Couldn't load that recording.");
  }
}

/** Saves a recording of one letter's sound (the request body is the audio itself). */
export async function PUT(request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { letter } = await params;
  if (!isLetter(letter)) return apiError(400, "Choose a letter from a to z.");
  const type = request.headers.get("content-type");
  if (!isAudioType(type)) return apiError(400, "That wasn't an audio recording. Record it again.");

  try {
    const data = Buffer.from(await request.arrayBuffer());
    if (data.length === 0) return apiError(400, "The recording was empty. Record it again.");
    if (data.length > MAX_SOUND_BYTES) return apiError(400, "That recording is too long. A letter sound needs only a second or two. Record it again.");
    await uploadSourceFile(soundKey(auth.account.id, letter), data, type!);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "sounds PUT", "Couldn't save the recording. Try again in a moment.");
  }
}

/** Removes the caller's recording of one letter, so the built-in voice is used again. */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { letter } = await params;
  if (!isLetter(letter)) return apiError(404, "That isn't a letter.");
  try {
    await deletePrefix(soundKey(auth.account.id, letter));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "sounds DELETE", "Couldn't remove the recording. Try again in a moment.");
  }
}
