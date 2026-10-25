"use client";

import { useEffect, useState } from "react";
import type { AnswerLanguage } from "@/lib/generation/language";
import { keep, peek } from "@/lib/client-cache";
import { PACK_WAIT_STEPS, ROUTE_BY_TASK, TABS, WAIT_STEPS, type MeResponse, usesBooks } from "@/app/dashboard/_ask/constants";
import { AskHeader } from "@/app/dashboard/_ask/AskHeader";
import { AttachmentList } from "@/app/dashboard/_ask/AttachmentList";
import { BookPicker } from "@/app/dashboard/_ask/BookPicker";
import { BooksInUse } from "@/app/dashboard/_ask/BooksInUse";
import { DropForm } from "@/app/dashboard/_ask/DropForm";
import { Messages } from "@/app/dashboard/_ask/Messages";
import { QuickCommands } from "@/app/dashboard/_ask/QuickCommands";
import { PromptBox } from "@/app/dashboard/_ask/PromptBox";
import { ComposerToolbar } from "@/app/dashboard/_ask/ComposerToolbar";
import { GeneratingCard } from "@/app/dashboard/_ask/Parts";
import { PdfPagePicker } from "@/app/dashboard/_ask/PdfPagePicker";
import { PackChapter } from "@/app/dashboard/_ask/PackChapter";
import { ResultSection } from "@/app/dashboard/_ask/ResultSection";
import { TabPicker } from "@/app/dashboard/_ask/TabPicker";
import { COMMANDS, booksOfKinds, commandsInView, planCommand, type QuickCommand } from "@/app/dashboard/_ask/commands";
import { blockedReason, buildRequestBody, calculationAnswer, questionProblem, type Question } from "@/app/dashboard/_ask/build-request";
import { useAttachments } from "@/app/dashboard/_ask/useAttachments";
import { useBooks } from "@/app/dashboard/_ask/useBooks";
import { useGeneration } from "@/app/dashboard/_ask/useGeneration";
import type { GenerationTaskType } from "@/types/database";

/** Under the question: the book picker when it is open, else which books the answer comes from (none for kinds that use no books). */
function bookAreaFor(tab: GenerationTaskType, bookCount: number, open: boolean): "picker" | "names" | null {
  if (!usesBooks(tab) || bookCount === 0) return null;
  return open ? "picker" : "names";
}

export default function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(() => peek<MeResponse>("me") ?? null);
  const [tab, setTab] = useState<GenerationTaskType>("solution");
  const [prompt, setPrompt] = useState("");
  // Sample papers: total marks to aim for (Indian school papers are often 80).
  const [totalMarks, setTotalMarks] = useState("80");
  // Paper checker: marks for each question ("" = the marks on the paper, or 5).
  const [marksEach, setMarksEach] = useState("");
  const [showBooks, setShowBooks] = useState(false);
  // Language for this question; until changed, the Account page's default.
  const [answerLanguage, setAnswerLanguage] = useState<AnswerLanguage | null>(null);
  // Study packs: the chapter (a book from My books); null means the newest book.
  const [packBookId, setPackBookId] = useState<string | null>(null);

  async function loadMe() {
    const res = await fetch("/api/me");
    const data = await res.json().catch(() => null);
    if (res.ok && data) setMe(keep("me", data));
  }

  const books = useBooks();
  const generation = useGeneration(() => void loadMe().catch(() => {}));
  const { error, notice, setError, setNotice } = generation;
  const attachments = useAttachments(setError, setNotice);
  const { photos, docs, reading: readingFiles } = attachments;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount is intentional here (the cached copy, if any, shows at once)
    loadMe().catch(() => {});
  }, []);

  const language: AnswerLanguage = answerLanguage ?? me?.student.answer_language ?? "auto";
  // The chapter for a study pack: the book picked (none is pre-chosen). Attached pages win over it (see buildRequestBody).
  const chosenPackBook = packBookId ?? "";
  const currentTab = TABS.find((t) => t.value === tab)!;
  const isPack = tab === "study_pack";
  // Marking a paper uses no book.
  const isCheck = tab === "paper_check";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (generation.isBusy() || readingFiles || blocked) return;
    const question: Question = {
      task: tab,
      prompt,
      totalMarks,
      marksEach,
      language,
      packBookId: chosenPackBook,
      bookIds: books.activeIds,
      photos,
      docs,
    };

    // A question that is only a calculation ("Divide 5255 by 5", "LCM of 12, 18 and 30") is answered by code: exact, instant, and no AI used.
    const calculation = calculationAnswer(question);
    if (calculation) {
      generation.showWorked(calculation.example, calculation.problem);
      return;
    }

    const problem = questionProblem(question);
    if (problem) {
      setError(problem);
      return;
    }
    if (await generation.send(ROUTE_BY_TASK[tab], buildRequestBody(question), tab)) attachments.clear();
  }

  /** Switching kind starts that kind afresh: the text, attachments, messages and the last answer from the other kind are cleared. */
  function chooseTab(next: GenerationTaskType) {
    if (next === tab || generation.isBusy()) return;
    setTab(next);
    setPrompt("");
    attachments.clear();
    generation.clear();
  }

  /** A quick command: fills the question box and, when it names kinds of book, searches only those (and shows the picker so they can be changed). */
  function runCommand(command: QuickCommand) {
    setPrompt(command.prompt);
    const plan = planCommand(command, books.books);
    setNotice(plan.notice);
    if (plan.books) {
      books.selectOnly(plan.books);
      setShowBooks(true);
    }
  }

  async function makeNewAnswer() {
    const again = generation.resend();
    if (!again) return;
    setTab(again.task);
    if (await again.done) attachments.clear();
  }

  const noBookSelected = usesBooks(tab) && books.books.length > 0 && books.activeIds.length === 0;
  const overQuota = me?.quota.overQuota ?? false;
  const blocked = blockedReason({ overQuota, noBookSelected, readingFiles, choosingPages: attachments.longPdfs.length > 0 });
  const bookArea = bookAreaFor(tab, books.books.length, showBooks);
  const showCommands = commandsInView(tab, prompt, photos.length > 0 || docs.length > 0);

  return (
    <div className="space-y-6">
      <AskHeader me={me} overQuota={overQuota} booksFailed={books.failed} noBooks={books.loaded && books.books.length === 0} />

      <TabPicker tab={tab} onChoose={chooseTab} />

      <DropForm onSubmit={submit} onFiles={(files) => void attachments.add(files)}>
        {isPack && <PackChapter books={books.books} value={chosenPackBook} onChange={setPackBookId} attachedPages={photos.length} />}

        <PromptBox
          value={prompt}
          onChange={setPrompt}
          onSend={() => void submit()}
          onPictures={(files) => void attachments.add(files)}
          placeholder={currentTab.placeholder}
        />

        {showCommands && <QuickCommands commands={COMMANDS[tab]} onPick={runCommand} />}

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

        {bookArea === "names" && (
          <BooksInUse books={books.books} activeIds={books.activeIds} onChange={() => setShowBooks(true)} />
        )}

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
          loading={generation.loading}
          readingFiles={readingFiles}
          noBookSelected={noBookSelected}
          overQuota={overQuota}
          blocked={blocked}
          onAttach={(files) => void attachments.add(files)}
          onToggleBooks={() => setShowBooks((v) => !v)}
          onTotalMarks={setTotalMarks}
          onMarksEach={setMarksEach}
          onLanguage={setAnswerLanguage}
        />
      </DropForm>

      <Messages blocked={generation.loading ? null : blocked} error={error} notice={notice} />

      {generation.loading && (
        <GeneratingCard steps={isPack ? PACK_WAIT_STEPS : WAIT_STEPS} draft={generation.draft} onStop={generation.stop} />
      )}

      <ResultSection
        worked={generation.worked}
        result={generation.result}
        resultRef={generation.resultRef}
        workedInQuestion={generation.workedInQuestion}
        openWorked={generation.openWorked}
        onOpenWorked={generation.setOpenWorked}
        onMakeNewAnswer={makeNewAnswer}
      />
    </div>
  );
}
