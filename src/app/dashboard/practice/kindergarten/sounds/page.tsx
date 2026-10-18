"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LetterRow } from "@/app/dashboard/practice/kindergarten/sounds/_parts/LetterRow";
import { useSoundRecorder } from "@/app/dashboard/practice/kindergarten/sounds/_parts/useSoundRecorder";
import { Alert, PageHeader } from "@/components/ui";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";
import { TEACHING_ORDER } from "@/lib/kindergarten/phonics";

/**
 * Record the letter sounds in the voice the child's school uses (m, a, p...),
 * so the activities sound like the teacher: pure sounds, no extra "uh".
 * Recordings are private to this account.
 */
export default function RecordSoundsPage() {
  const [have, setHave] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { recording, draft, start, stop, discardDraft } = useSoundRecorder((message) => {
    setError(message);
    if (message === null) setNotice(null);
  });
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
      discardDraft();
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
          .map((letter) => (
            <LetterRow
              key={letter}
              letter={letter}
              saved={have.has(letter)}
              hasDraft={draft?.letter === letter}
              recording={recording === letter}
              otherRecording={recording !== null}
              busy={busy !== null}
              onRecord={() => void start(letter)}
              onStop={stop}
              onListenDraft={() => draft && play(draft.url)}
              onSave={() => void save()}
              onPlaySaved={() => void playSaved(letter)}
              onRemove={() => void remove(letter)}
            />
          ))}
      </ul>
    </div>
  );
}
