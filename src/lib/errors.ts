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
  return fallback;
}
