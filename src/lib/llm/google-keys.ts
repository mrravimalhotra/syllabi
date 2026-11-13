// Two Gemini keys: a free-tier key (a Google project with no billing, rate-limited per minute and per day, ₹0) and
// the paid key. When the free key is set it is tried first for every call; the paid key takes over when the free
// tier is busy, over its allowance, silent, or refuses the model. A model the free key just failed on is not tried
// with it again for a while, so people don't wait for the free tier on every question. Free-tier prompts may be used
// by Google to improve its products (the owner accepted this, 2026-11-13).

import { assertHeaderSafe } from "@/lib/llm/assert-header-safe";
import { BlockedReplyError, DAILY_LIMIT } from "@/lib/errors";

const BUSY_REST_MS = 60_000;
// The free daily allowance only comes back at midnight (Pacific time); an hour keeps the paid key from waiting on it.
const DAILY_LIMIT_REST_MS = 60 * 60_000;
// Anything else (the free project can't use this model, the key was removed): try again later.
const OTHER_REST_MS = 30 * 60_000;
const BUSY = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|overloaded|UNAVAILABLE/i;

const restingUntil = new Map<string, number>();

function checked(name: string): string | null {
  const key = process.env[name]?.trim();
  if (!key) return null;
  assertHeaderSafe(name, key);
  return key;
}

/** The paid Gemini key, checked to be usable in an HTTP header. */
function paidGoogleKey(): string {
  const key = checked("GOOGLE_API_KEY");
  if (!key) throw new Error("GOOGLE_API_KEY is not configured");
  return key;
}

/** The free-tier key, when one is set and differs from the paid one. */
function freeGoogleKey(): string | null {
  const key = checked("GOOGLE_API_KEY_FREE");
  return key && key !== process.env.GOOGLE_API_KEY?.trim() ? key : null;
}

function rest(model: string, message: string) {
  const ms = DAILY_LIMIT.test(message) ? DAILY_LIMIT_REST_MS : BUSY.test(message) ? BUSY_REST_MS : OTHER_REST_MS;
  restingUntil.set(model, Date.now() + ms);
}

/** Whether the free key is resting for this model. */
const freeKeyResting = (model: string) => (restingUntil.get(model) ?? 0) > Date.now();

/** Forgets every rest (tests). */
export const resetFreeKeyRests = () => restingUntil.clear();

/**
 * Runs a Gemini call with the free key first, then with the paid key if the free one can't serve it. `run` is told
 * whether it has the free key, so it can fail fast on a busy reply instead of waiting. `onSwitch` is called before
 * the paid try (a streamed draft starts over). A reply blocked for its content is not tried again: the paid key would
 * be refused the same way.
 */
export async function withFreeKeyFirst<T>(model: string, run: (key: string, free: boolean) => Promise<T>, onSwitch?: () => void): Promise<T> {
  const free = freeGoogleKey();
  if (!free || freeKeyResting(model)) return run(paidGoogleKey(), false);
  try {
    return await run(free, true);
  } catch (err) {
    if (err instanceof BlockedReplyError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    rest(model, message);
    console.warn(`[google] free key can't serve ${model} now (${message.slice(0, 160)}); using the paid key`);
    onSwitch?.();
    return run(paidGoogleKey(), false);
  }
}
