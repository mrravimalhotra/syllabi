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
  if (status >= 500) return `Couldn't ${what} because of a problem on our side. Wait a minute and try again. If it keeps happening, tell the person who runs Syllabi.`;
  return `Couldn't ${what}. Check what you entered and try again.`;
}

/** The message shown when the request never reached the server. */
export const OFFLINE_MESSAGE = "Couldn't reach Syllabi. Check your internet connection and try again.";
