import type { GenerationResult } from "@/app/dashboard/_ask/constants";

/**
 * How often the server is asked how the answer is going. It is waited for while it is still moving on (a busy model
 * can stretch an answer past five minutes: Report, 13 Nov, a part saved after 362 s); it is given up on when it has
 * been quiet this long (it stopped), or after the longest any answer could take.
 */
const ASK_EVERY_MS = 5000;
const STOPPED_AFTER_QUIET_S = 240;
const GIVE_UP_AFTER_S = 900;

/** Waits a while, or less: coming back to the app (from another app, or unlocking the phone) asks at once. */
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", back);
      resolve();
    };
    const back = () => document.visibilityState === "visible" && done();
    const timer = setTimeout(done, ms);
    document.addEventListener("visibilitychange", back);
    signal.addEventListener("abort", done, { once: true });
  });

const PENDING_KEY = "syllabi:pending-answer";

/** An answer being made, remembered so that it can be picked up after the phone closed the page (switching apps, a locked screen). */
export interface PendingAnswer {
  runId: string;
  startedAt: number;
  task: string;
}

export function rememberPending(pending: PendingAnswer | null) {
  try {
    if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Private browsing: the answer is still saved in My Documents.
  }
}

/** The answer still being made when the page was last open, if it began recently enough to be waited for or fetched. */
export function pendingAnswer(): PendingAnswer | null {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as PendingAnswer | null;
    if (v && typeof v.runId === "string" && typeof v.startedAt === "number" && typeof v.task === "string" && Date.now() - v.startedAt < 30 * 60_000) return v;
  } catch {
    // Unreadable: forget it.
  }
  rememberPending(null);
  return null;
}

/**
 * The connection dropped while an answer was being made (a phone network, a locked screen), but the server carries
 * on and saves it. This asks how the request is going until it has ended, then fetches the saved answer. Resolves
 * to the answer, "failed" when the server says it failed, or null when it never finished (or waiting was stopped).
 * `interval` is only shortened by tests.
 */
/** One look at the request: "waiting" while it is still being made, otherwise how it ended. */
async function lookAt(runId: string, signal: AbortSignal): Promise<GenerationResult | "failed" | "waiting" | null> {
  // Still offline, or the server unreachable: ask again shortly. A request the server doesn't know can't be picked up.
  const res = await fetch(`/api/generate/runs/${runId}`, { signal }).catch(() => null);
  if (res?.status === 404) return null;
  const run = (res?.ok ? await res.json().catch(() => null) : null) as { outcome?: string | null; documentId?: string | null; quietFor?: number } | null;
  if (!run?.outcome) return (run?.quietFor ?? 0) > STOPPED_AFTER_QUIET_S ? null : "waiting";
  if (run.outcome === "failed") return "failed";
  if (!run.documentId) return null;
  const saved = (await fetch(`/api/documents/${run.documentId}`, { signal })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { answer?: GenerationResult & { pack?: GenerationResult["pack"] | null } } | null;
  return saved?.answer ? { ...saved.answer, pack: saved.answer.pack ?? undefined } : "waiting";
}

export async function recoverAnswer(runId: string, startedAt: number, signal: AbortSignal, interval = ASK_EVERY_MS): Promise<GenerationResult | "failed" | null> {
  for (let first = true; !signal.aborted && (first || Date.now() - startedAt < GIVE_UP_AFTER_S * 1000); first = false) {
    if (!first) await pause(interval, signal);
    if (signal.aborted) return null;
    const seen = await lookAt(runId, signal);
    if (seen !== "waiting") return seen;
  }
  return null;
}
