// Works out the correct response to an objective question from its model
// answer, so a practice test can mark the child's choice instantly (no AI,
// no self-marking). Returns nothing when the answer isn't clear-cut.

import type { AutoKey } from "@/lib/study-pack/types";

const TRUE_WORDS = /^(true|correct|yes|सत्य|सही|बरोबर|vrai)(?![\p{L}\p{M}])/iu;
const FALSE_WORDS = /^(false|incorrect|wrong|no|असत्य|गलत|ग़लत|चूक|faux)(?![\p{L}\p{M}])/iu;

/** Lower case, letters, marks and digits only: "  **Rajagriha.** " → "rajagriha". */
export function normaliseResponse(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

/** The letter an option is labelled with: "(a) Delhi", "a) Delhi", "a. Delhi", "A: Delhi". */
function optionLetter(option: string): string | null {
  return /^\s*\(?([a-hA-H])[).:\s]/.exec(option)?.[1].toLowerCase() ?? null;
}

function optionText(option: string): string {
  return normaliseResponse(option.replace(/^\s*\(?[a-hA-H][).:]\s*/, ""));
}

export function autoKeyFor(question: string, type: string, options: string[], answer: string): AutoKey | undefined {
  const plain = answer.replace(/[*_`]/g, "").trim();

  if (options.length >= 2) {
    // "(b) Agra" or "b) Agra" or "Option b"
    const letter = /^\s*(?:option\s*)?\(?([a-hA-H])[).:\s]/i.exec(plain)?.[1].toLowerCase();
    if (letter) {
      const index = options.findIndex((o) => optionLetter(o) === letter);
      if (index !== -1) return { kind: "option", index };
    }
    // Unlabelled options: the answer starts with one option's text (the longest match wins).
    const start = normaliseResponse(plain);
    const matches = options
      .map((o, index) => ({ index, text: optionText(o) }))
      .filter((o) => o.text && start.startsWith(o.text))
      .sort((a, b) => b.text.length - a.text.length);
    if (matches.length > 0) return { kind: "option", index: matches[0].index };
    return undefined;
  }

  if (/true|false|सत्य|असत्य|सही|गलत|बरोबर|चूक|vrai|faux/i.test(`${type} ${question}`)) {
    if (TRUE_WORDS.test(plain)) return { kind: "truefalse", value: true };
    if (FALSE_WORDS.test(plain)) return { kind: "truefalse", value: false };
  }

  if (/_{3,}|\.{4,}|fill in/i.test(`${question} ${type}`)) {
    // The answer word is the first bold phrase, or a short first line.
    const bold = /\*\*([^*]{1,60})\*\*/.exec(answer)?.[1];
    const firstLine = plain.split("\n")[0].replace(/^(ans(wer)?|उत्तर)\s*:\s*/i, "").trim();
    const word = bold ?? (firstLine.split(/\s+/).length <= 4 ? firstLine : "");
    const options = word
      .split(/\s*(?:\/|\bor\b|,)\s*/)
      .map(normaliseResponse)
      .filter(Boolean);
    if (options.length > 0) return { kind: "blank", answers: options };
  }
  return undefined;
}
