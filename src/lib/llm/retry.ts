/**
 * Retries a call when it fails for a reason that usually clears up by itself:
 * a transport error (connection dropped, DNS hiccup, timeout) or the provider
 * being briefly overloaded or rate-limited (HTTP 429/500/502/503/504,
 * "overloaded", "UNAVAILABLE", "RESOURCE_EXHAUSTED"). Gemini returns these
 * often for a few seconds at a time. Other errors (bad request, invalid key,
 * blocked content) are not retried.
 */
const TRANSIENT =
  /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|\b(429|500|502|503|504)\b|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED|try again later/i;

const DELAYS_MS = [2000, 6000];

export async function withNetworkRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt >= DELAYS_MS.length || !TRANSIENT.test(message)) throw err;
      await new Promise((resolve) => setTimeout(resolve, DELAYS_MS[attempt]));
    }
  }
}

/** fetch() that throws on HTTP statuses worth retrying, so withNetworkRetry can retry them. */
export async function fetchOrThrowTransient(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status === 429 || response.status >= 500) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  return response;
}
