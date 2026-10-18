"use client";

import { button, card, cx } from "@/components/ui";
import { IPA, PHONEMES } from "@/lib/kindergarten/phonics";

interface Props {
  letter: string;
  /** A recording of this letter is saved and used. */
  saved: boolean;
  /** This letter has a new recording waiting to be listened to and saved. */
  hasDraft: boolean;
  /** This letter is being recorded right now. */
  recording: boolean;
  /** Another letter is being recorded, so Record is off. */
  otherRecording: boolean;
  /** A save or removal is in progress. */
  busy: boolean;
  onRecord: () => void;
  onStop: () => void;
  onListenDraft: () => void;
  onSave: () => void;
  onPlaySaved: () => void;
  onRemove: () => void;
}

/** One letter: its sound and mouth tip, whether the app uses a recording, and the buttons to record, listen, save, play or remove. */
export function LetterRow({
  letter,
  saved,
  hasDraft,
  recording,
  otherRecording,
  busy,
  onRecord,
  onStop,
  onListenDraft,
  onSave,
  onPlaySaved,
  onRemove,
}: Props) {
  const p = PHONEMES[letter];
  return (
    <li className={cx(card, "flex flex-wrap items-center gap-3 p-3 sm:p-4")}>
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-4xl font-bold text-brand-800"
        aria-hidden
      >
        {letter}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold text-slate-900">
          {letter === "c" ? "c says “k”" : `Letter ${letter}`} <span className="text-brand-700">/{IPA[letter]}/</span>{" "}
          <span aria-hidden>{p.keyword.emoji}</span> <span className="font-normal text-slate-500">{p.keyword.word}</span>
        </p>
        <p className="text-xs text-slate-500">{p.tip}</p>
        <p className="text-xs font-medium">
          {saved ? (
            <span className="text-emerald-700">✓ Your recording is used</span>
          ) : (
            <span className="text-slate-400">Using the built-in voice</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {recording ? (
          <button type="button" onClick={onStop} className={button.smallDanger} aria-label={`Stop recording ${letter}`}>
            ■ Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onRecord}
            disabled={otherRecording || busy}
            className={button.small}
            aria-label={`Record the sound for ${letter}`}
          >
            ● Record
          </button>
        )}
        {hasDraft && (
          <>
            <button type="button" onClick={onListenDraft} className={button.small} aria-label={`Listen to the new recording of ${letter}`}>
              ▶ Listen
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className={button.smallPrimary}
              aria-label={`Save the recording of ${letter}`}
            >
              Save
            </button>
          </>
        )}
        {!hasDraft && saved && !recording && (
          <>
            <button type="button" onClick={onPlaySaved} className={button.small} aria-label={`Play the saved sound for ${letter}`}>
              ▶ Play
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className={button.small}
              aria-label={`Remove the recording of ${letter}`}
            >
              Remove
            </button>
          </>
        )}
      </div>
      {recording && (
        <p className="basis-full text-sm font-medium text-red-700" role="status">
          Recording… say the sound now.
        </p>
      )}
    </li>
  );
}
