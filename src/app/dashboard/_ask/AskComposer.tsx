"use client";

import { TABS, usesBooks } from "@/app/dashboard/_ask/constants";
import { AttachmentList } from "@/app/dashboard/_ask/AttachmentList";
import { BookPicker } from "@/app/dashboard/_ask/BookPicker";
import { BooksInUse } from "@/app/dashboard/_ask/BooksInUse";
import { ComposerToolbar } from "@/app/dashboard/_ask/ComposerToolbar";
import { DropForm } from "@/app/dashboard/_ask/DropForm";
import { PackChapter } from "@/app/dashboard/_ask/PackChapter";
import { PdfPagePicker } from "@/app/dashboard/_ask/PdfPagePicker";
import { PromptBox } from "@/app/dashboard/_ask/PromptBox";
import { QuickCommands } from "@/app/dashboard/_ask/QuickCommands";
import { COMMANDS, booksOfKinds, commandsInView, type QuickCommand } from "@/app/dashboard/_ask/commands";
import type { useAttachments } from "@/app/dashboard/_ask/useAttachments";
import type { useBooks } from "@/app/dashboard/_ask/useBooks";
import type { AnswerLanguage } from "@/lib/generation/language";
import type { GenerationTaskType } from "@/types/database";

/** Under the question: the book picker when it is open, else which books the answer comes from (none for kinds that use no books). */
function bookAreaFor(tab: GenerationTaskType, bookCount: number, open: boolean): "picker" | "names" | null {
  if (!usesBooks(tab) || bookCount === 0) return null;
  return open ? "picker" : "names";
}

interface Props {
  tab: GenerationTaskType;
  prompt: string;
  onPrompt: (text: string) => void;
  onSubmit: (e?: React.FormEvent) => void | Promise<void>;
  attachments: ReturnType<typeof useAttachments>;
  books: ReturnType<typeof useBooks>;
  showBooks: boolean;
  onShowBooks: (open: boolean) => void;
  packBookId: string;
  onPackBook: (id: string) => void;
  onCommand: (command: QuickCommand) => void;
  totalMarks: string;
  onTotalMarks: (value: string) => void;
  marksEach: string;
  onMarksEach: (value: string) => void;
  language: AnswerLanguage;
  onLanguage: (language: AnswerLanguage) => void;
  loading: boolean;
  noBookSelected: boolean;
  overQuota: boolean;
  blocked: string | null;
}

/** A tool's question form: the question box, attachments, the books it uses, and the send bar. */
export function AskComposer({
  tab,
  prompt,
  onPrompt,
  onSubmit,
  attachments,
  books,
  showBooks,
  onShowBooks,
  packBookId,
  onPackBook,
  onCommand,
  totalMarks,
  onTotalMarks,
  marksEach,
  onMarksEach,
  language,
  onLanguage,
  loading,
  noBookSelected,
  overQuota,
  blocked,
}: Props) {
  const { photos, docs, reading: readingFiles } = attachments;
  const currentTab = TABS.find((t) => t.value === tab)!;
  const isPack = tab === "study_pack";
  const isCheck = tab === "paper_check";
  const bookArea = bookAreaFor(tab, books.books.length, showBooks);
  const showCommands = commandsInView(tab, prompt, photos.length > 0 || docs.length > 0);
  return (
    <DropForm onSubmit={onSubmit} onFiles={(files) => void attachments.add(files)}>
      {isPack && <PackChapter books={books.books} value={packBookId} onChange={onPackBook} attachedPages={photos.length} />}

      <PromptBox
        value={prompt}
        onChange={onPrompt}
        onSend={() => void onSubmit()}
        onPictures={(files) => void attachments.add(files)}
        placeholder={currentTab.placeholder}
      />

      {showCommands && <QuickCommands commands={COMMANDS[tab]} onPick={onCommand} />}

      <AttachmentList
        photos={photos}
        docs={docs}
        reading={readingFiles}
        onRemovePhoto={attachments.removePhoto}
        onRemoveDoc={attachments.removeDoc}
      />

      {attachments.longPdfs.map((pdf, i) => (
        <PdfPagePicker
          key={pdf.file.name + i}
          pdf={pdf}
          room={attachments.pagesLeft}
          busy={readingFiles}
          onAttach={(first, last) => void attachments.attachPages(i, first, last)}
          onSkip={() => attachments.skipPdf(i)}
        />
      ))}

      {bookArea === "picker" && (
        <BookPicker
          books={books.books}
          activeIds={books.activeIds}
          onAll={books.selectAll}
          onNone={books.selectNone}
          onKind={(kind) => books.selectOnly(booksOfKinds(books.books, [kind]))}
          onToggle={books.toggle}
        />
      )}

      {bookArea === "names" && <BooksInUse books={books.books} activeIds={books.activeIds} onChange={() => onShowBooks(true)} />}

      <ComposerToolbar
        isPack={isPack}
        isSamplePaper={tab === "sample_paper"}
        isPaperCheck={isCheck}
        photoCount={photos.length}
        bookCount={books.books.length}
        activeCount={books.activeIds.length}
        booksOpen={showBooks}
        totalMarks={totalMarks}
        marksEach={marksEach}
        language={language}
        loading={loading}
        readingFiles={readingFiles}
        noBookSelected={noBookSelected}
        overQuota={overQuota}
        blocked={blocked}
        onAttach={(files) => void attachments.add(files)}
        onToggleBooks={() => onShowBooks(!showBooks)}
        onTotalMarks={onTotalMarks}
        onMarksEach={onMarksEach}
        onLanguage={onLanguage}
      />
    </DropForm>
  );
}
