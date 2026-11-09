/**
 * A sentence for a failed request when the server didn't send its own
 * message: says what happened and what to do, from the HTTP status.
 * `what` completes "Couldn't ..." (for example "make your answer").
 */
export function failedRequestMessage(status: number, what: string): string {
  if (status === 401) return "You were signed out. Sign in again, then repeat that.";
  if (status === 403) return "Your account doesn't have access to this right now. Contact the person who runs Syllabi for you.";
  if (status === 404) return "That item no longer exists. Reload the page.";
  if (status === 413) return "What you sent is too large. Attach fewer or smaller files and try again.";
  if (status === 429) return "Too many requests or your monthly allowance is used up. Wait a minute and try again.";
  if (status === 504) return `Couldn't ${what}: it took longer than the 5 minutes Syllabi allows. Ask for less at once (fewer books, or one exercise at a time).`;
  if (status >= 500) return `Couldn't ${what} because of a problem on our side. Wait a minute and try again. If it keeps happening, tell the person who runs Syllabi.`;
  return `Couldn't ${what}. Check what you entered and try again.`;
}

/** The message shown when the request never reached the server. */
export const OFFLINE_MESSAGE = "Couldn't reach Syllabi. Check your internet connection and try again.";

/** The request didn't get through although the device says it is online: the server, not the phone's connection. */
export const SERVER_UNREACHABLE_MESSAGE = "Couldn't reach Syllabi's server, though this device seems to be online. Wait a minute and try again.";

/** How long one answer may take before the server is stopped (the routes' maxDuration). */
const ANSWER_TIME_LIMIT_S = 300;

/**
 * An answer that stopped coming in after `seconds`: near the server's time limit it ran out of time (say how to ask
 * for less), otherwise the connection was cut.
 */
export function answerStoppedMessage(seconds: number): string {
  if (seconds >= ANSWER_TIME_LIMIT_S - 30) {
    return `The answer stopped after ${Math.round(seconds / 60)} minutes, before it was finished: Syllabi allows 5 minutes for one answer, and this one needed longer. Ask for less at once (fewer books, or one exercise at a time).`;
  }
  return `The answer stopped after ${seconds} seconds, before it was finished: the connection dropped. If it was saved, it will appear in My Documents. Otherwise, try again.`;
}
