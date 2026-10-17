/** An error whose message is written for the person using the app, so it is safe to show them. */
export class UserError extends Error {}

/**
 * The AI replied without text: blocked by its safety filter, or declining to
 * copy published text word for word ("recitation"). Carries any partial text.
 */
export class BlockedReplyError extends UserError {
  constructor(
    message: string,
    readonly finishReason: string,
    readonly partialText: string
  ) {
    super(message);
  }
}

/** A provider error saying the free tier's daily allowance for a model is used up (retrying today won't help). */
export const DAILY_LIMIT = /PerDay|per day|daily limit/i;

const GENERIC = "Something went wrong. Please try again.";

/** Messages our own database functions raise on purpose (RAISE EXCEPTION, code P0001) are written for people. */
function isRaisedByOurDatabase(err: unknown): err is { message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P0001" &&
    typeof (err as { message?: unknown }).message === "string"
  );
}

/** The text of anything that was thrown: an Error, a plain object with a message (database and provider errors often are), or a string. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const { message, error, details } = err as { message?: unknown; error?: unknown; details?: unknown };
    for (const part of [message, error, details]) if (typeof part === "string" && part) return part;
    try {
      return JSON.stringify(err).slice(0, 500);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Turns any error into a message that is safe to show. UserError messages and
 * deliberate database messages pass through; anything else (raw database,
 * storage or AI-provider errors) is logged with `context` for us and replaced
 * with a plain sentence for the user.
 */
export function userMessage(err: unknown, context: string, fallback = GENERIC): string {
  if (err instanceof UserError) return err.message;
  if (isRaisedByOurDatabase(err)) return err.message;
  console.error(`[${context}]`, err);
  // The AI provider's limits, said plainly rather than "something went wrong".
  const message = errorText(err);
  if (DAILY_LIMIT.test(message)) {
    return "The AI service's free daily limit is used up for today. It resets around 12:30 to 1:30 pm India time. The person who runs Syllabi can turn on billing for more.";
  }
  if (/\b(429|503)\b|RESOURCE_EXHAUSTED|overloaded|UNAVAILABLE/i.test(message)) {
    return "The AI service is busy right now. Wait a minute and try again.";
  }
  return fallback;
}
