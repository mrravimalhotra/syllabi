import { sourceTypeLabel } from "@/lib/format";
import type { Book } from "@/app/dashboard/_ask/constants";
import type { GenerationTaskType, SourceType } from "@/types/database";

/** A ready-made request: one tap fills the question box and, when it names kinds of book, picks those books. */
export interface QuickCommand {
  /** What the chip says. */
  label: string;
  /** What is put in the question box (and sent). */
  prompt: string;
  /** Searches only the books of these kinds (Exercise books, Test papers...), when the person has any. */
  books?: SourceType[];
}

export const COMMANDS: Record<GenerationTaskType, QuickCommand[]> = {
  solution: [
    {
      label: "Solve all exercises",
      prompt: "Solve every exercise in the selected books: every question of every section, in order, to the last page.",
      books: ["exercise"],
    },
    {
      label: "Solve all test papers",
      prompt: "Solve every question of the selected test papers, section by section, in order, with the marks for each.",
      books: ["past_paper"],
    },
    {
      label: "Solve the chapter exercise",
      prompt: "Solve the Textual Exercise at the end of the chapter: every question of every section, in order.",
      books: ["textbook"],
    },
    {
      label: "Answer the lesson questions",
      prompt:
        "Answer all the questions inside the lessons (Warm-up, Source Analysis, 21st Century Skills and similar boxes), in page order.",
      books: ["textbook"],
    },
    {
      label: "Solve everything in the chapter",
      prompt:
        "Answer all the questions in the chapter: first the questions inside the lessons, then the exercise at the end, every question in order.",
      books: ["textbook"],
    },
    {
      label: "Answer key only",
      prompt: "Give a numbered answer key for every question in the exercise: only the answers, one line each, in order.",
      books: ["exercise", "textbook"],
    },
    { label: "Explain a method", prompt: "Explain how to find the LCM of 12, 18 and 30, step by step." },
  ],
  notes: [
    {
      label: "Notes for the whole chapter",
      prompt: "Revision notes for the whole chapter, covering every heading, with key terms in bold.",
    },
    { label: "One-page summary", prompt: "A one-page summary of the chapter that can be read the night before the test." },
    { label: "Key terms and definitions", prompt: "Key terms and definitions from the chapter, each in one line." },
    { label: "Timeline and dates", prompt: "A timeline of the important events, dates and people in the chapter, one line each." },
    {
      label: "Likely exam questions",
      prompt: "Short revision notes on the chapter, then the most likely exam questions with model answers.",
    },
  ],
  sample_paper: [
    { label: "Chapter test, 20 marks", prompt: "A chapter test of 20 marks on the whole chapter, with an answer key." },
    {
      label: "Half-yearly paper, 80 marks",
      prompt: "A half-yearly paper of 80 marks on the chapters in the selected books, with an answer key.",
    },
    {
      label: "Test from the exercises",
      prompt: "A class test of 25 marks made from the style of the questions in the exercises, with an answer key.",
      books: ["exercise", "textbook"],
    },
    {
      label: "Quick quiz, 10 questions",
      prompt: "A quick quiz of 10 questions on the chapter: a mix of fill in the blanks, true or false and multiple choice, with answers.",
    },
    {
      label: "Like the past papers",
      prompt: "A new paper in the style, sections and marking of the selected past papers, with an answer key.",
      books: ["past_paper"],
    },
  ],
  ad_hoc: [
    {
      label: "Explain the chapter simply",
      prompt: "Explain the chapter in simple words, as if to a Class 6 student, with one everyday example for each idea.",
    },
    { label: "Five key points", prompt: "What are the five most important points of this chapter that every student must remember?" },
    {
      label: "Check understanding",
      prompt: "Ask me ten questions, from easy to hard, to check whether I have understood the chapter, with the answers after.",
    },
    { label: "Plan revision", prompt: "How should we plan revision for next week's test on this chapter, day by day?" },
    { label: "Project ideas", prompt: "Ideas for a school project or activity based on this chapter, with what is needed for each." },
  ],
  study_pack: [],
};

/** Ids of the ready books that are of one of these kinds. */
export function booksOfKinds(books: Book[], kinds: SourceType[]): string[] {
  return books.filter((b) => kinds.includes(b.source_type)).map((b) => b.id);
}

const KIND_NAMES: Record<SourceType, string> = {
  textbook: "textbooks",
  exercise: "exercise books",
  past_paper: "test papers",
  notes: "notes",
};

export const kindName = (kind: SourceType) => KIND_NAMES[kind];

/** What to tell the person when a command's kind of book hasn't been uploaded. */
export function noBooksMessage(kinds: SourceType[]): string {
  const names = kinds.map(kindName).join(" or ");
  return `You haven't uploaded any ${names} yet, so this uses the books you have selected. Upload one in My books (set its kind to ${kinds.map(sourceTypeLabel).join(" or ")}), or choose the books yourself.`;
}

/** The commands stay in view while the box is empty or only holds one of them (so another can be tried), and never with something attached. */
export function commandsInView(tab: GenerationTaskType, prompt: string, hasAttachment: boolean): boolean {
  if (hasAttachment) return false;
  return prompt.trim() === "" || COMMANDS[tab].some((c) => c.prompt === prompt.trim());
}

/** What choosing a command does to the books: the ids to search only (null = leave the choice alone) and a message when its kind isn't uploaded. */
export function planCommand(command: QuickCommand, books: Book[]): { books: string[] | null; notice: string | null } {
  if (!command.books) return { books: null, notice: null };
  const ids = booksOfKinds(books, command.books);
  return ids.length > 0 ? { books: ids, notice: null } : { books: null, notice: noBooksMessage(command.books) };
}
