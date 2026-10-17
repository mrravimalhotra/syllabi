// A study pack: one chapter turned into a walkthrough, answered textbook
// questions, a practice test and a glossary. See docs/study-pack.md.

export interface VocabularyItem {
  word: string;
  meaning: string;
}

export interface WalkthroughPart {
  title: string;
  /** What happens (story) or what the chapter says (information). */
  summary: string;
  whyItMatters: string;
  /** Story chapters only: how the characters feel, and how the text shows it. */
  feelings: string | null;
  vocabulary: VocabularyItem[];
  /** Plain text to read aloud to the child. */
  narration: string;
}

export interface PackQuestion {
  /** As printed in the book, e.g. "Q3 (b)"; empty for practice questions. */
  number: string;
  question: string;
  /** e.g. "Short answer", "MCQ", "HOTS". */
  type: string;
  marks: number | null;
  /** MCQs only: the options as printed, e.g. ["(a) Delhi", "(b) Agra"]. */
  options: string[];
  hint: string;
  /** Copied from the chapter; checked on the server. */
  evidence: string;
  /** null when there was no chapter text to check against (e.g. photos only). */
  evidenceFound: boolean | null;
  answer: string;
  /** The answer the AI wrote, kept when the parent refines it, so it can be restored. */
  originalAnswer?: string;
  narration: string;
  /** Practice questions only. */
  difficulty: "easy" | "medium" | "hard" | null;
  skill: string;
}

export interface StudyPack {
  version: 1;
  title: string;
  subject: string;
  kind: "story" | "information";
  /** Setting (story) or a two-sentence summary (information). */
  overview: string;
  themes: string[];
  characters: { name: string; role: string }[];
  walkthrough: WalkthroughPart[];
  textbookQuestions: PackQuestion[];
  /** True if the chapter had no exercise and these were written instead. */
  textbookQuestionsWritten: boolean;
  practiceQuestions: PackQuestion[];
  glossary: VocabularyItem[];
  /** Book title and pages the pack was made from, for the PDF and the screen. */
  source: string;
  /** The book in My books it was made from, so refining an answer can re-read the chapter. */
  sourceDocumentId: string | null;
}

export type PackSection = "textbookQuestions" | "practiceQuestions";
