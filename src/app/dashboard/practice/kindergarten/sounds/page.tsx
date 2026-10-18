"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, PageHeader, button, card, cx } from "@/components/ui";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";
import { PHONEMES, TEACHING_ORDER } from "@/lib/kindergarten/phonics";

const MAX_SECONDS = 3;

type Draft = { letter: string; blob: Blob; url: string };

/**
 * Record the letter sounds in the voice the child's school uses (m, a, p...),
 * so the activities sound like the teacher: pure sounds, no extra "uh".
 * Recordings are private to this account.
 */
export default function RecordSoundsPage() {
  const [have, setHave] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/sounds")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error);
        setHave(new Set<string>(data.letters ?? []));
      })
      .catch(() => setLoadError(true));
  }, []);

  const play = (url: string) => {
    player.current?.pause();
    player.current = new Audio(url);
    void player.current.play().catch(() => setError("Your phone didn't start the sound. Press Play again."));
  };

  async function startRecording(letter: string) {
    setError(null);
    setNotice(null);
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record sound. Try Safari or Chrome on your phone.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Syllabi can't use the microphone. Allow microphone access for this site in your browser settings, then try again.");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || type || "audio/webm" });
      setRecording(null);
      if (blob.size === 0) return setError("Nothing was recorded. Check the microphone and try again.");
      setDraft({ letter, blob, url: URL.createObjectURL(blob) });
    };
    recorder.current = rec;
    rec.start();
    setRecording(letter);
    setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000);
  }

  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();

  async function save() {
    if (!draft) return;
    setBusy(draft.letter);
    setError(null);
    try {
      const res = await fetch(`/api/sounds/${draft.letter}`, {
        method: "PUT",
        headers: { "Content-Type": draft.blob.type },
        body: draft.blob,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the recording. Try again.");
      setHave((h) => new Set(h).add(draft.letter));
      setNotice(`Saved the sound for “${draft.letter}”. The activities will use it from now on.`);
      URL.revokeObjectURL(draft.url);
      setDraft(null);
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't save the recording. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function playSaved(letter: string) {
    setError(null);
    const res = await fetch(`/api/sounds/${letter}`).catch(() => null);
    if (!res?.ok) return setError("Couldn't load that recording.");
    play(URL.createObjectURL(await res.blob()));
  }

  async function remove(letter: string) {
    setBusy(letter);
    setError(null);
    const res = await fetch(`/api/sounds/${letter}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setError("Couldn't remove the recording. Try again.");
    else {
      setHave((h) => {
        const next = new Set(h);
        next.delete(letter);
        return next;
      });
      setNotice(`Removed. The built-in voice will say “${letter}” again.`);
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record the sounds"
        description="Record each letter sound the way the school teacher says it: the sound, not the name (m is “mmm”), and no extra “uh” on quick sounds (b, d, g, k, p, t). Each recording lasts a second or two and is kept private to your account."
      />
      <Link href="/dashboard/practice/kindergarten" className="text-sm font-medium text-brand-700 hover:underline">
        ← Back to Kindergarten
      </Link>
      {loadError && (
        <Alert tone="warning">Couldn&apos;t check which sounds you have recorded. You can still record; saved ones may not show yet.</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <ul className="space-y-3">
        {TEACHING_ORDER.slice()
          .sort()
          .map((letter) => {
            const p = PHONEMES[letter];
            const isDraft = draft?.letter === letter;
            const isRecording = recording === letter;
            return (
              <li key={letter} className={cx(card, "flex flex-wrap items-center gap-3 p-3 sm:p-4")}>
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-4xl font-bold text-brand-800"
                  aria-hidden
                >
                  {letter}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-semibold text-slate-900">
                    {letter === "c" ? "c says “k”" : `Letter ${letter}`} <span aria-hidden>{p.keyword.emoji}</span>{" "}
                    <span className="font-normal text-slate-500">{p.keyword.word}</span>
                  </p>
                  <p className="text-xs text-slate-500">{p.tip}</p>
                  <p className="text-xs font-medium">
                    {have.has(letter) ? (
                      <span className="text-emerald-700">✓ Your recording is used</span>
                    ) : (
                      <span className="text-slate-400">Using the built-in voice</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isRecording ? (
                    <button type="button" onClick={stopRecording} className={button.smallDanger} aria-label={`Stop recording ${letter}`}>
                      ■ Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startRecording(letter)}
                      disabled={recording !== null || busy !== null}
                      className={button.small}
                      aria-label={`Record the sound for ${letter}`}
                    >
                      ● Record
                    </button>
                  )}
                  {isDraft && (
                    <>
                      <button
                        type="button"
                        onClick={() => play(draft.url)}
                        className={button.small}
                        aria-label={`Listen to the new recording of ${letter}`}
                      >
                        ▶ Listen
                      </button>
                      <button
                        type="button"
                        onClick={() => void save()}
                        disabled={busy !== null}
                        className={button.smallPrimary}
                        aria-label={`Save the recording of ${letter}`}
                      >
                        Save
                      </button>
                    </>
                  )}
                  {!isDraft && have.has(letter) && !isRecording && (
                    <>
                      <button
                        type="button"
                        onClick={() => void playSaved(letter)}
                        className={button.small}
                        aria-label={`Play the saved sound for ${letter}`}
                      >
                        ▶ Play
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(letter)}
                        disabled={busy !== null}
                        className={button.small}
                        aria-label={`Remove the recording of ${letter}`}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
                {isRecording && (
                  <p className="basis-full text-sm font-medium text-red-700" role="status">
                    Recording… say the sound now.
                  </p>
                )}
              </li>
            );
          })}
      </ul>
    </div>
  );
}
