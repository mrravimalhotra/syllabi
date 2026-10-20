"use client";

import { ACCEPTED_FILES, MAX_PHOTOS } from "@/app/dashboard/_ask/constants";
import { BookIcon, PaperclipIcon, SparklesIcon } from "@/components/icons";
import { Spinner, button, cx } from "@/components/ui";
import { LANGUAGE_NAMES, type AnswerLanguage } from "@/lib/generation/language";

interface Props {
  isPack: boolean;
  isSamplePaper: boolean;
  isPaperCheck: boolean;
  photoCount: number;
  bookCount: number;
  /** How many books answers will search. */
  activeCount: number;
  booksOpen: boolean;
  totalMarks: string;
  marksEach: string;
  language: AnswerLanguage;
  loading: boolean;
  readingFiles: boolean;
  noBookSelected: boolean;
  overQuota: boolean;
  /** Why Generate is off (shown under the form), or null. */
  blocked: string | null;
  onAttach: (files: FileList | null) => void;
  onToggleBooks: () => void;
  onTotalMarks: (marks: string) => void;
  onMarksEach: (marks: string) => void;
  onLanguage: (language: AnswerLanguage) => void;
}

/** The row under the question box: attach files, choose books, marks and language, and the Generate button. */
export function ComposerToolbar(p: Props) {
  const {
    isPack,
    isSamplePaper,
    isPaperCheck,
    photoCount,
    bookCount,
    activeCount,
    booksOpen,
    totalMarks,
    marksEach,
    language,
    loading,
    readingFiles,
    noBookSelected,
    overQuota,
    blocked,
  } = p;
  const { onAttach, onToggleBooks, onTotalMarks, onMarksEach, onLanguage } = p;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-3 sm:px-4">
      <label
        className={cx(button.ghost, "cursor-pointer", photoCount >= MAX_PHOTOS && "pointer-events-none opacity-50")}
        title="Attach photos, a PDF or a Word file"
      >
        <PaperclipIcon className="h-4.5 w-4.5" />
        <span>Attach</span>
        <input
          type="file"
          accept={ACCEPTED_FILES}
          multiple
          className="sr-only"
          disabled={photoCount >= MAX_PHOTOS}
          onChange={(e) => {
            onAttach(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {bookCount > 0 && !isPack && !isPaperCheck && (
        <button
          type="button"
          onClick={onToggleBooks}
          aria-expanded={booksOpen}
          className={noBookSelected ? button.dangerGhost : button.ghost}
        >
          <BookIcon className="h-4.5 w-4.5" />
          {activeCount === bookCount
            ? bookCount === 1
              ? "Your 1 book"
              : `All ${bookCount} books`
            : `${activeCount} of ${bookCount} ${bookCount === 1 ? "book" : "books"}`}
        </button>
      )}

      {isPaperCheck && (
        <label className="inline-flex items-center gap-2 px-2 text-sm text-slate-600">
          Marks per question
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={marksEach}
            onChange={(e) => onMarksEach(e.target.value)}
            placeholder="5"
            aria-label="Marks per question"
            title="Leave empty to use the marks printed on the paper, or 5 per question when there are none"
            className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
      )}

      {isSamplePaper && (
        <label className="inline-flex items-center gap-2 px-2 text-sm text-slate-600">
          Marks
          <select
            value={totalMarks}
            onChange={(e) => onTotalMarks(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {["20", "40", "80", "100"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="ml-auto flex items-center gap-3">
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <span className="hidden sm:inline">Answer in</span>
          <select
            value={language}
            onChange={(e) => onLanguage(e.target.value as AnswerLanguage)}
            aria-label="Answer in"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
          >
            <option value="auto">Same as the book</option>
            {(["en", "hi", "mr", "fr"] as const).map((l) => (
              <option key={l} value={l} lang={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
        <span className="hidden text-xs text-slate-400 xl:inline">Ctrl + Enter</span>
        <button
          type="submit"
          disabled={loading || readingFiles || noBookSelected || overQuota}
          aria-describedby={blocked ? "generate-blocked" : undefined}
          className={button.primary}
        >
          {loading ? <Spinner /> : <SparklesIcon className="h-4.5 w-4.5" />}
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>
    </div>
  );
}
