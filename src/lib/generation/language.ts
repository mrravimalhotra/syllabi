// The language answers are written in. "auto" follows the book and question:
// a Hindi, Marathi or French chapter (a language subject, or a Hindi- or
// Marathi-medium book) gets answers in that language.

const ANSWER_LANGUAGES = ["auto", "en", "hi", "mr", "fr"] as const;
export type AnswerLanguage = (typeof ANSWER_LANGUAGES)[number];

/** Each language's name in that language, as shown in the pickers. */
export const LANGUAGE_NAMES: Record<Exclude<AnswerLanguage, "auto">, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
  fr: "Français",
};

export function isAnswerLanguage(value: unknown): value is AnswerLanguage {
  return typeof value === "string" && (ANSWER_LANGUAGES as readonly string[]).includes(value);
}

const KEEP = "Keep names, numbers, formulas, code and quotations from the book exactly as printed.";

/** The prompt line that sets the answer's language. */
export function languageLine(language: AnswerLanguage | null | undefined): string {
  switch (language) {
    case "en":
      return `Write everything in English, even if the book or question is in another language; when quoting a passage in another language, give the quote and then its meaning in English. ${KEEP}`;
    case "hi":
      return `Write everything in Hindi, in Devanagari script, using the terms a Hindi-medium school textbook uses (with the English term in brackets once where it helps). ${KEEP}`;
    case "mr":
      return `Write everything in Marathi, in Devanagari script, using the terms a Maharashtra State Board Marathi-medium textbook uses (with the English term in brackets once where it helps). ${KEEP}`;
    case "fr":
      return `Write everything in French, with correct accents, as a French-language school textbook would. For a French language lesson, explain grammar points in simple French and give the English meaning of new words in brackets. ${KEEP}`;
    default:
      return `Write in the language of the book and the question: a Hindi, Marathi or French chapter or question gets its answer in that language (Hindi and Marathi in Devanagari script); otherwise write in English. ${KEEP}`;
  }
}

/** BCP 47 code for read-aloud voices. */
export const SPEECH_LANG: Record<string, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN", fr: "fr-FR" };
