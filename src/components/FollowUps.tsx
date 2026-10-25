"use client";

import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Alert, Spinner, button, cx, input } from "@/components/ui";
import { MAX_FOLLOW_UPS, MAX_FOLLOW_UP_CHARS, type FollowUp } from "@/lib/generation/follow-up";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";

/** One-tap follow-ups for the commonest needs. */
const SUGGESTIONS = ["Explain it more simply", "Explain the hardest step again", "Give one more example", "Why is this the answer?"];

/**
 * Follow-up questions under an answer ("explain step 3 again"): earlier ones with their replies, and a box to ask
 * another. Each reply knows the answer above, and is kept with it.
 */
export function FollowUps({ answerId, initial = [] }: { answerId: string; initial?: FollowUp[] }) {
  const [followUps, setFollowUps] = useState<FollowUp[]>(initial);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = followUps.length >= MAX_FOLLOW_UPS;

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking) return;
    setAsking(q);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${answerId}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "answer the follow-up"));
      setFollowUps((list) => [...list, data.followUp as FollowUp]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error && err.message ? err.message : "Couldn't answer the follow-up. Try again.");
    } finally {
      setAsking(null);
    }
  }

  return (
    <section className="space-y-4 border-t border-slate-100 px-4 py-4 sm:px-6 print:px-0" aria-label="Follow-up questions">
      {followUps.map((f, i) => (
        <div key={i} className="space-y-2">
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">{f.question}</p>
          <div className="text-sm text-slate-800">
            <Markdown text={f.answer} />
          </div>
        </div>
      ))}
      {asking && (
        <div className="space-y-2" role="status">
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">{asking}</p>
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Thinking about your follow-up...
          </p>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {full ? (
        <p className="text-xs text-slate-500 print:hidden">This answer has {MAX_FOLLOW_UPS} follow-ups. Ask anything else as a new question on Ask Syllabi.</p>
      ) : (
        <form
          className="space-y-2 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <label htmlFor={`follow-up-${answerId}`} className="text-sm font-medium text-slate-900">
            {followUps.length ? "Ask another follow-up" : "Not clear? Ask a follow-up about this answer"}
          </label>
          {followUps.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  disabled={!!asking}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              id={`follow-up-${answerId}`}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={MAX_FOLLOW_UP_CHARS}
              placeholder="e.g. Explain step 3 again"
              className={cx(input, "min-w-0 flex-1")}
              disabled={!!asking}
            />
            <button type="submit" className={button.primary} disabled={!!asking || !question.trim()}>
              {asking ? <Spinner /> : "Ask"}
            </button>
          </div>
          <p className="text-xs text-slate-500">Uses a little of your monthly allowance. Replies are kept with this answer.</p>
        </form>
      )}
    </section>
  );
}
