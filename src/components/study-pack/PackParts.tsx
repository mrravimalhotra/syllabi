"use client";

import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { AlertIcon, CheckIcon, SparklesIcon, SpeakerIcon, StopIcon, UndoIcon } from "@/components/icons";
import { Badge, Spinner, button, cx, input } from "@/components/ui";
import { type Speech } from "@/components/study-pack/useSpeech";
import type { PackQuestion, PackSection } from "@/lib/study-pack/types";

export function ListenButton({ id, text, speech, label = "Listen" }: { id: string; text: string; speech: Speech; label?: string }) {
  if (!speech.supported || !text) return null;
  const speaking = speech.speakingId === id;
  const loading = speech.loadingId === id;
  return (
    <button
      type="button"
      onClick={() => void speech.speak(id, text)}
      className={cx(button.small, (speaking || loading) && "border-brand-500 text-brand-700")}
      aria-pressed={speaking || loading}
    >
      {loading ? <Spinner className="h-4 w-4" /> : speaking ? <StopIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
      {loading ? "Getting the voice… (tap to cancel)" : speaking ? "Stop" : label}
    </button>
  );
}

export function QuestionMeta({ q }: { q: PackQuestion }) {
  const tone = q.difficulty === "easy" ? "success" : q.difficulty === "hard" ? "danger" : q.difficulty ? "warning" : "neutral";
  return (
    <div className="flex flex-wrap gap-1.5">
      {q.difficulty && <Badge tone={tone}>{q.difficulty[0].toUpperCase() + q.difficulty.slice(1)}</Badge>}
      {q.type && <Badge>{q.type}</Badge>}
      {q.marks ? (
        <Badge>
          {q.marks} mark{q.marks > 1 ? "s" : ""}
        </Badge>
      ) : null}
    </div>
  );
}

function Evidence({ q }: { q: PackQuestion }) {
  if (!q.evidence) return null;
  return (
    <figure className="rounded-xl border-l-4 border-brand-300 bg-brand-50/50 px-4 py-3">
      <blockquote className="text-sm leading-6 text-slate-700 italic">&ldquo;{q.evidence}&rdquo;</blockquote>
      <figcaption className="mt-1.5 text-xs">
        {q.evidenceFound === true && (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckIcon className="h-3.5 w-3.5" /> Found in the book
          </span>
        )}
        {q.evidenceFound === false && (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <AlertIcon className="h-3.5 w-3.5" /> Not found word for word: check it against the book
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** The answer, its read-aloud walkthrough, and the refine box. */
export function AnswerBlock({
  q,
  section,
  index,
  answerId,
  speech,
  onChange,
}: {
  q: PackQuestion;
  section: PackSection;
  index: number;
  answerId: string | null;
  speech: Speech;
  onChange: (section: PackSection, index: number, question: PackQuestion) => void;
}) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Earlier versions of this answer in this visit, for Undo.
  const [history, setHistory] = useState<string[]>([]);

  async function send(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    if (!answerId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${answerId}/pack`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, index, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "change this answer"));
      onChange(section, index, data.question);
      return true;
    } catch (err) {
      setError(
        err instanceof TypeError
          ? OFFLINE_MESSAGE
          : err instanceof Error
            ? err.message
            : "Couldn't change this answer. Try again in a moment."
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function refine(text: string) {
    const previous = q.answer;
    if (await send("POST", { request: text })) {
      setHistory((h) => [...h, previous]);
      setRequest("");
    }
  }

  async function undo() {
    const previous = history[history.length - 1];
    if (previous && (await send("PATCH", { answer: previous }))) setHistory((h) => h.slice(0, -1));
  }

  return (
    <div className="space-y-3">
      <Evidence q={q} />
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
        <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">Model answer</p>
        <div className="mt-1">
          <Markdown text={q.answer} />
        </div>
      </div>
      {q.skill && <p className="text-xs text-slate-500">Skill tested: {q.skill}</p>}
      <div className="flex flex-wrap gap-2">
        <ListenButton id={`${section}-${index}`} text={q.narration} speech={speech} label="Explain it aloud" />
        {history.length > 0 && (
          <button type="button" onClick={undo} disabled={busy} className={button.small}>
            <UndoIcon className="h-4 w-4" /> Undo
          </button>
        )}
        {q.originalAnswer && history.length === 0 && (
          <button type="button" onClick={() => send("PATCH", { answer: q.originalAnswer })} disabled={busy} className={button.small}>
            <UndoIcon className="h-4 w-4" /> Restore original
          </button>
        )}
      </div>

      {answerId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (request.trim()) refine(request.trim());
          }}
          className="space-y-2 rounded-xl bg-slate-50 p-3"
        >
          <label htmlFor={`refine-${section}-${index}`} className="text-xs font-medium text-slate-600">
            Change this answer
          </label>
          <div className="flex flex-wrap gap-1.5">
            {["Make it simpler", "Make it shorter", "Add more detail", "Make it a 5-mark answer"].map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => refine(s)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-brand-200 hover:text-brand-700 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              id={`refine-${section}-${index}`}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Or type what to change, for example “use an example from daily life”"
              maxLength={500}
              disabled={busy}
              className={cx(input, "min-w-0 flex-1")}
            />
            <button type="submit" disabled={busy || !request.trim()} className={button.primary}>
              {busy ? <Spinner /> : <SparklesIcon className="h-4 w-4" />}
              <span className="hidden sm:inline">{busy ? "Changing..." : "Change"}</span>
              <span className="sr-only sm:hidden">Change this answer</span>
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}

export function QuestionText({ q, label, hideOptions }: { q: PackQuestion; label: string; hideOptions?: boolean }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[15px] leading-6 font-medium text-slate-900">
        <span className="mr-1.5 text-brand-700">{label}</span>
        {q.question}
      </p>
      {q.options.length > 0 && !hideOptions && (
        <ul className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
          {q.options.map((o) => (
            <li key={o} className="rounded-lg bg-slate-50 px-3 py-1.5">
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
