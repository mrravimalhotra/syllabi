import type { GenerationResult } from "@/app/dashboard/_ask/constants";

/** How often the server is asked how the answer is going, and how long after it began there is no point asking. */
const ASK_EVERY_MS = 5000;
const GIVE_UP_AFTER_S = 330;

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

/**
 * The connection dropped while an answer was being made (a phone network, a locked screen), but the server carries
 * on and saves it. This asks how the request is going until it has ended, then fetches the saved answer. Resolves
 * to the answer, "failed" when the server says it failed, or null when it never finished (or waiting was stopped).
 * `interval` is only shortened by tests.
 */
export async function recoverAnswer(runId: string, startedAt: number, signal: AbortSignal, interval = ASK_EVERY_MS): Promise<GenerationResult | "failed" | null> {
  while (!signal.aborted && Date.now() - startedAt < GIVE_UP_AFTER_S * 1000) {
    await pause(interval, signal);
    if (signal.aborted) return null;
    // Still offline, or the server unreachable: ask again shortly. A request the server doesn't know can't be picked up.
    const res = await fetch(`/api/generate/runs/${runId}`, { signal }).catch(() => null);
    if (res?.status === 404) return null;
    const run = (res?.ok ? await res.json().catch(() => null) : null) as { outcome?: string | null; documentId?: string | null } | null;
    if (!run?.outcome) continue;
    if (run.outcome === "failed" || !run.documentId) return run.outcome === "failed" ? "failed" : null;
    const saved = (await fetch(`/api/documents/${run.documentId}`, { signal })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)) as { answer?: GenerationResult & { pack?: GenerationResult["pack"] | null } } | null;
    if (saved?.answer) return { ...saved.answer, pack: saved.answer.pack ?? undefined };
  }
  return null;
}
