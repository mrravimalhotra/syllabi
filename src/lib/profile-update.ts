import { cleanText } from "@/lib/validate";
import { BOARDS, CLASS_LEVELS } from "@/lib/generation/level";
import { isAnswerLanguage } from "@/lib/generation/language";

type Result = { ok: true; updates: Record<string, string | null> } | { ok: false; message: string };
type Step = (value: unknown) => { column: string; value: string | null } | { message: string };

// "" clears a setting; anything else must be one of the listed options.
const FIELDS: Record<string, Step> = {
  fullName: (v) => {
    const fullName = cleanText(v, 120);
    return fullName ? { column: "full_name", value: fullName } : { message: "Type your name. It can't be empty." };
  },
  classLevel: (v) =>
    v !== "" && !CLASS_LEVELS.includes(v as string) ? { message: "Choose a class from the list." } : { column: "class_level", value: (v as string) || null },
  board: (v) => (v !== "" && !BOARDS.includes(v as string) ? { message: "Choose a school board from the list." } : { column: "board", value: (v as string) || null }),
  answerLanguage: (v) =>
    v !== "auto" && !isAnswerLanguage(v) ? { message: "Choose an answer language from the list." } : { column: "answer_language", value: v === "auto" ? null : (v as string) },
};

/** Checks the profile fields a person edits themselves (name, class, board, answer language) and returns the columns to change, or the message to show. */
export function parseProfileUpdate(body: unknown): Result {
  if (body === null || typeof body !== "object") return { ok: false, message: "Your change couldn't be read. Try again." };
  const updates: Record<string, string | null> = {};
  for (const [field, check] of Object.entries(FIELDS)) {
    if (!(field in body)) continue;
    const step = check((body as Record<string, unknown>)[field]);
    if ("message" in step) return { ok: false, message: step.message };
    updates[step.column] = step.value;
  }
  return Object.keys(updates).length === 0 ? { ok: false, message: "There was nothing to change." } : { ok: true, updates };
}
