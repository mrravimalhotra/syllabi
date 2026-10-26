// Follow-up questions on an answer: kept with it, and answered with the original answer in view.

export interface FollowUp {
  question: string;
  answer: string;
  createdAt: string;
}

/** The most follow-ups one answer keeps (then a new question starts afresh). */
export const MAX_FOLLOW_UPS = 10;
/** The longest follow-up question. */
export const MAX_FOLLOW_UP_CHARS = 1000;

export const FOLLOW_UP_SYSTEM = `You are Syllabi, a patient tutor for a school student and their parent. You already gave the answer shown below; now answer a follow-up question about it.

Rules:
- Answer only the follow-up. Do not repeat the whole answer: refer to its steps or parts ("In step 3, ...") and explain just what was asked.
- Keep it short and clear for the student's level: a few sentences, or a few short steps when working is needed. Use Markdown; write maths in plain Unicode (x², √x, ×, ÷, ½), never LaTeX or dollar signs.
- Stay consistent with the answer above. If the follow-up shows a real mistake in it, say so plainly and give the correction.
- Use the book passages, when given, as the source of truth, as the original answer did. Do not invent page numbers.
- Write in the same language as the answer above unless the follow-up asks for another.
- If the follow-up is about something unrelated, answer briefly and suggest asking it as a new question.`;

/** The text the AI gets: the original question and answer, earlier follow-ups, then the new one. */
export function followUpPrompt(input: { title: string; answer: string; earlier: FollowUp[]; question: string; level: string }): string {
  const earlier = input.earlier.map((f, i) => `Follow-up ${i + 1}: ${f.question}\nYour reply: ${f.answer}`).join("\n\n");
  return [
    input.level,
    `The question was: ${input.title}`,
    `Your answer:\n"""\n${input.answer}\n"""`,
    earlier ? `Earlier follow-ups on it:\n${earlier}` : "",
    `New follow-up: ${input.question}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Saved follow-ups read back from the database; anything malformed is left out. */
export function parseFollowUps(value: unknown): FollowUp[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (f): f is FollowUp => !!f && typeof f === "object" && typeof f.question === "string" && typeof f.answer === "string" && typeof f.createdAt === "string"
  );
}
