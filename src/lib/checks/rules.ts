// Rule checks on generated answers, done by code (no AI): a sample paper's
// marks add up to the total asked for and every question has an answer in the
// key; a worksheet's questions were all answered.

import { hasAnswerKey, withoutAnswerKey } from "@/lib/format";
import { splitQuestions } from "@/lib/rag/split-questions";
import type { AnswerCheck } from "@/types/database";

// Marks written at the end of a question line: "[2]", "(2)", "(2 marks)", "[1 mark]", "– 3 marks", "(2 अंक)", "(2 गुण)".
const MARKS_AT_END =
  /(?:[[(]\s*(\d{1,2})\s*(?:marks?|m|अंक|गुण|points?)?\s*[\])]|[-–—]\s*(\d{1,2})\s*(?:marks?|अंक|गुण))\s*\**\s*$/i;
// A question line: "Q1.", "Q.1", "1.", "1)", "प्रश्न 1", with optional bold.
const QUESTION_LINE = /^\s*\**\s*(?:Q\.?\s*|प्रश्न\s*|प्र\.?\s*)?([0-9०-९]{1,2})\s*[.):]/i;
const SUBPART_LINE = /^\s*\**\s*\(?(?:[a-h]|i{1,3}|iv|v|vi{0,3})[.)]\s/i;
const SECTION_LINE = /section|खंड|विभाग|partie|part\s+[a-z0-9]/i;

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const toAscii = (digits: string) => digits.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

/**
 * Sample paper: the marks shown on its questions add up to the total asked
 * for, the answer key exists, and every question number in the paper appears
 * in the key.
 */
export function checkSamplePaper(answer: string, totalMarks: number | null): AnswerCheck[] {
  const checks: AnswerCheck[] = [];
  const paper = withoutAnswerKey(answer);
  const lines = paper.split("\n");

  if (totalMarks) {
    // Two readings, because a long question may show its own marks and its
    // sub-parts' marks: question lines only, and question plus sub-part lines.
    let questionMarks = 0;
    let allMarks = 0;
    for (const line of lines) {
      if (SECTION_LINE.test(line) && !QUESTION_LINE.test(line)) continue;
      const match = MARKS_AT_END.exec(line);
      if (!match) continue;
      const marks = Number(match[1] ?? match[2]);
      if (QUESTION_LINE.test(line)) questionMarks += marks;
      if (QUESTION_LINE.test(line) || SUBPART_LINE.test(line)) allMarks += marks;
    }
    if (questionMarks > 0 || allMarks > 0) {
      const ok = questionMarks === totalMarks || allMarks === totalMarks;
      const found = questionMarks || allMarks;
      checks.push({
        kind: "marks",
        ok,
        message: ok ? `Marks add up to ${totalMarks}` : `Marks shown on the questions add up to ${found}, not ${totalMarks}`,
      });
    }
  }

  if (!hasAnswerKey(answer)) {
    checks.push({ kind: "answer-key", ok: false, message: "The paper has no answer key" });
    return checks;
  }
  const key = answer.slice(paper.length);
  const numbers = (text: string) =>
    new Set(
      text
        .split("\n")
        .map((l) => QUESTION_LINE.exec(l)?.[1])
        .filter((n): n is string => Boolean(n))
        .map(toAscii)
    );
  const asked = numbers(paper);
  const answered = numbers(key);
  const missing = [...asked].filter((n) => !answered.has(n)).sort((a, b) => Number(a) - Number(b));
  if (asked.size > 0) {
    checks.push({
      kind: "answer-key",
      ok: missing.length === 0,
      message:
        missing.length === 0
          ? `Answer key covers all ${asked.size} questions`
          : `Answer key is missing question${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`,
    });
  }
  return checks;
}

// Answer markers in the layout the prompts ask for ("**Ans:**"), plus common variants.
const ANSWER_MARKER = /^\s*\**\s*(?:Ans(?:wer)?|उत्तर|Réponse)\s*\**\s*[:：]/gim;

/**
 * A worksheet or exercise: the number of answers is at least the number of
 * questions found in the request. Only for requests with several questions.
 */
export function checkCoverage(questionText: string, answer: string): AnswerCheck[] {
  const questions = splitQuestions(questionText).length;
  if (questions < 2) return [];
  const answers = (answer.match(ANSWER_MARKER) ?? []).length;
  // Without answer markers we can't count reliably: say nothing.
  if (answers === 0) return [];
  const ok = answers >= questions;
  return [
    {
      kind: "coverage",
      ok,
      message: ok
        ? `All ${questions} questions answered`
        : `${answers} answers for ${questions} questions: some may have been missed`,
    },
  ];
}
