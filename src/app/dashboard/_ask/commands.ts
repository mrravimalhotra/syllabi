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

/**
 * The command for each kind of answer. One to start with: a clear, complete request is better than many vague ones.
 * (More can be added here: each is a label, the full request, and the kinds of book it searches.)
 */
export const COMMANDS: Record<GenerationTaskType, QuickCommand[]> = {
  solution: [
    {
      label: "Solve all exercise questions",
      prompt:
        "Solve every question of every exercise in the selected books, in order, to the last page, and also the questions inside the lessons (Warm-up, Source Analysis, 21st Century Skills and similar boxes). " +
        "Answer every kind of question the exercises ask: fill in the blanks, true or false, multiple choice, assertion and reason, match the following, ordering, " +
        "picture and passage based questions with all their sub-parts, one-word answers, answer in brief or in short, answer in detail (justify, explain, describe, do you think), " +
        "and research or find-out questions. Do not skip or merge any question. Label each answer with its section and number (for example Q3.2). " +
        "Write each answer from the book, in your own words, and as long as the question asks for.",
      books: ["exercise", "textbook"],
    },
  ],
  notes: [],
  sample_paper: [],
  ad_hoc: [],
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
