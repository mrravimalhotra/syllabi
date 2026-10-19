import type { Answer } from "@/components/AnswerView";
import { ChatIcon, ClipboardIcon, LayersIcon, ListCheckIcon, NotesIcon } from "@/components/icons";
import type { StudyPack } from "@/lib/study-pack/types";
import type { GenerationTaskType, Student } from "@/types/database";

// Attachments to a question: up to this many images (photos, PDF pages, Word
// pictures) within the request size budget, plus the text of Word files.
export const MAX_PHOTOS = 12;
export const MAX_ATTACHMENT_BASE64_CHARS = 3_000_000;
export const ACCEPTED_FILES =
  "image/jpeg,image/png,image/webp,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface MeResponse {
  student: Student;
  quota: { used: number; quota: number; remaining: number; overQuota: boolean };
}

export interface Book {
  id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  status: "processing" | "ready" | "failed";
}

export type GenerationResult = Answer & {
  id: string | null;
  pack?: StudyPack;
  /** Set when the saved answer to the same question was returned (no AI used). */
  reusedFrom?: string;
  /** Where the time went on the server (milliseconds), for finding what is slow. */
  timings?: {
    totalMs: number;
    readingPhotosMs: number;
    searchMs: number;
    loadingImagesMs: number;
    firstWordsMs: number | null;
    writingMs: number;
    repairMs: number;
    savedMs: number;
    model: string;
  };
};

export const TABS: {
  value: GenerationTaskType;
  label: string;
  description: string;
  icon: typeof ListCheckIcon;
  placeholder: string;
  examples: string[];
}[] = [
  {
    value: "solution",
    label: "Solve",
    description: "Step by step",
    icon: ListCheckIcon,
    placeholder: "Type or paste the question, or attach a photo or PDF of the worksheet",
    examples: ["Solve all the questions in the attached exercise", "Explain how to find the LCM of 12, 18 and 30"],
  },
  {
    value: "notes",
    label: "Notes",
    description: "Revision notes",
    icon: NotesIcon,
    placeholder: "Which chapter or topic should the notes cover?",
    examples: ["Revision notes for the chapter on Motion", "Key terms and definitions from the Internet chapter"],
  },
  {
    value: "sample_paper",
    label: "Sample paper",
    description: "Practice tests",
    icon: ClipboardIcon,
    placeholder: "Which chapters or topics should the paper cover?",
    examples: ["Half-yearly paper on chapters 1 to 4", "A short class test on fractions"],
  },
  {
    value: "ad_hoc",
    label: "Ask",
    description: "Any question",
    icon: ChatIcon,
    placeholder: "Ask any study question",
    examples: ["Ideas for a Class 6 science project on plants", "How should we plan revision for next week's test?"],
  },
  {
    value: "study_pack",
    label: "Study pack",
    description: "A whole chapter",
    icon: LayersIcon,
    placeholder: "Optional: what to focus on, for example “keep the language simple” or “extra practice on dates”",
    examples: [],
  },
];

export const ROUTE_BY_TASK: Record<GenerationTaskType, string> = {
  solution: "/api/generate/solution",
  notes: "/api/generate/notes",
  sample_paper: "/api/generate/sample-paper",
  ad_hoc: "/api/generate/ad-hoc",
  study_pack: "/api/generate/study-pack",
};

// What the person sees while waiting; the steps move on with time, since the
// server answers in one go.
export const PACK_WAIT_STEPS = [
  { after: 0, text: "Reading the chapter" },
  { after: 6, text: "Writing the walkthrough, answers and practice test" },
  { after: 50, text: "Checking every quote against the book" },
  { after: 90, text: "Still working: a long chapter can take two or three minutes" },
];

export const WAIT_STEPS = [
  { after: 0, text: "Reading your question and attachments" },
  { after: 4, text: "Finding the right pages in your books" },
  { after: 10, text: "Writing the answer" },
  { after: 45, text: "Still writing: a whole worksheet or paper can take a minute or two" },
];
