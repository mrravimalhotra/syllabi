// Grading one answer of the quality test set: code checks for the facts it must (and must not) contain,
// and an AI examiner's scores. Kept apart from run.ts so it can be tested without the AI.

export interface QualityCase {
  id: string;
  subject: string;
  /** "Class 7", for the student's level line. */
  class: string;
  task: "solution" | "notes" | "ad_hoc";
  question: string;
  /** The book passages the answer is written from (empty for a question the books don't cover). */
  passages: { page: number; label: string; text: string; type?: string }[];
  /** What a correct, complete answer says, for the examiner. */
  expected: string;
  /** Text the answer must contain (case-insensitive); "a|b" accepts either. */
  must: string[];
  /** Text the answer must not contain (a known wrong answer, copied handwriting). */
  mustNot?: string[];
}

export interface JudgeScores {
  /** 0 wrong, 1 partly right, 2 right. */
  correct: number;
  /** 0 misses most, 1 misses a part, 2 answers everything asked. */
  complete: number;
  /** 0 invents facts, 1 adds unmarked outside facts, 2 stays with the passages (or honestly says they lack it). */
  grounded: number;
  notes: string;
}

export const JUDGE_SYSTEM = `You are a senior examiner grading an answer written for a school student by a study app. You get the
question, the book passages the app was given, the expected answer (the key points a correct answer
contains), and the app's answer. Grade strictly, as for a board exam, on three scales:
- correct: 2 if every fact, number and step is right; 1 if mostly right with a minor error; 0 if a key
  fact or the final answer is wrong.
- complete: 2 if every question and part asked is answered; 1 if a part is missing; 0 if most is missing.
- grounded: 2 if it follows the passages (outside facts marked "(general knowledge)"), or honestly says
  the passages do not cover the question when they don't; 1 if it adds unmarked outside facts; 0 if it
  invents facts or sources.
Wording, layout and length do not matter unless the question sets a limit. Reply only with JSON:
{"correct": 0-2, "complete": 0-2, "grounded": 0-2, "notes": "one sentence on the main problem, or 'fine'"}`;

/** The "must" and "mustNot" checks: what is missing and what should not be there. */
export function factChecks(answer: string, must: string[], mustNot: string[] = []): { missing: string[]; unwanted: string[] } {
  const text = answer.toLowerCase().replace(/\s+/g, " ");
  const has = (needle: string) => needle.split("|").some((n) => text.includes(n.toLowerCase().trim()));
  return { missing: must.filter((m) => !has(m)), unwanted: mustNot.filter((m) => has(m)) };
}

/** The examiner's reply read back; null when it can't be read. */
export function parseJudge(text: string): JudgeScores | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const scale = (n: unknown) => (typeof n === "number" && [0, 1, 2].includes(n) ? n : null);
    const [correct, complete, grounded] = [scale(v.correct), scale(v.complete), scale(v.grounded)];
    if (correct === null || complete === null || grounded === null) return null;
    return { correct, complete, grounded, notes: typeof v.notes === "string" ? v.notes.slice(0, 300) : "" };
  } catch {
    return null;
  }
}

/** One answer's score out of 100 (correctness counts double), and whether it passes. */
export function scoreCase(scores: JudgeScores | null, facts: { missing: string[]; unwanted: string[] }): { score: number; pass: boolean } {
  const factsOk = facts.missing.length === 0 && facts.unwanted.length === 0;
  if (!scores) return { score: 0, pass: false };
  // A missing must-have fact or a known wrong answer means it is not correct, whatever the examiner thought.
  const correct = factsOk ? scores.correct : Math.min(scores.correct, 1);
  const score = Math.round(((correct * 2 + scores.complete + scores.grounded) / 8) * 100);
  return { score, pass: factsOk && correct === 2 && scores.complete >= 1 && scores.grounded >= 1 };
}
