"use client";

import { useRef, useState } from "react";

const MAX_SECONDS = 3;

export type Draft = { letter: string; blob: Blob; url: string };

/** Asks for the microphone; null (with the problem reported) when the browser can't record or the person says no. */
async function openMicrophone(onProblem: (message: string) => void): Promise<MediaStream | null> {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    onProblem("This browser can't record sound. Try Safari or Chrome on your phone.");
    return null;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    onProblem("Syllabi can't use the microphone. Allow microphone access for this site in your browser settings, then try again.");
    return null;
  }
}

/**
 * Records a short clip of one letter's sound (up to 3 seconds). The finished
 * recording is kept as a draft to listen to before it is saved. Problems are
 * reported through `onProblem`.
 */
export function useSoundRecorder(onProblem: (message: string | null) => void) {
  const [recording, setRecording] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  const discardDraft = () => {
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft(null);
  };

  async function start(letter: string) {
    onProblem(null);
    discardDraft();
    const stream = await openMicrophone(onProblem);
    if (!stream) return;
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || type || "audio/webm" });
      setRecording(null);
      if (blob.size === 0) return onProblem("Nothing was recorded. Check the microphone and try again.");
      setDraft({ letter, blob, url: URL.createObjectURL(blob) });
    };
    recorder.current = rec;
    rec.start();
    setRecording(letter);
    setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000);
  }

  return {
    recording,
    draft,
    start,
    stop: () => recorder.current?.state === "recording" && recorder.current.stop(),
    discardDraft,
  };
}
