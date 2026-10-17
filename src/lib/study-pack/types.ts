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
  /** An animated picture for this part; absent in packs made before scenes. */
  scene?: Scene | null;
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
  /** For objective questions, the correct response worked out by code, so the child's answer can be marked instantly. */
  autoKey?: AutoKey;
  skill: string;
}

export interface StudyPack {
  version: 1;
  title: string;
  subject: string;
  kind: "story" | "information";
  /** Two-letter code of the pack's language (en, hi, mr, fr...), for read-aloud voices. */
  language: string;
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

export type AutoKey =
  | { kind: "option"; index: number }
  | { kind: "truefalse"; value: boolean }
  | { kind: "blank"; answers: string[] };

export type PackSection = "textbookQuestions" | "practiceQuestions";

/** The backdrops a study-pack scene can use. */
export const SCENE_BACKDROPS = ["sky", "forest", "ocean", "night", "desert", "village", "city", "classroom", "mountain", "temple", "space", "lab"] as const;
export type SceneBackdrop = (typeof SCENE_BACKDROPS)[number];

/** How a scene's picture moves. Fixed list: the AI picks from it, so nothing it writes is ever run as code. */
export const SCENE_MOTIONS = ["float", "bounce", "sway", "spin", "pulse", "walk", "fly", "grow"] as const;
export type SceneMotion = (typeof SCENE_MOTIONS)[number];

/** A small animated picture for a walkthrough part: emoji that move over a coloured backdrop. */
export interface Scene {
  backdrop: SceneBackdrop;
  actors: { emoji: string; motion: SceneMotion }[];
  /** A few words under the picture, e.g. "The sun warms the plant". */
  caption: string;
}
