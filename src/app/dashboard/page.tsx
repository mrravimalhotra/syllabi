"use client";

import { useEffect, useState } from "react";
import { pureProblem, solve } from "@/lib/worked/detect";
import type { AnswerLanguage } from "@/lib/generation/language";
import { keep, peek } from "@/lib/client-cache";
import { PACK_WAIT_STEPS, ROUTE_BY_TASK, TABS, WAIT_STEPS, type MeResponse } from "@/app/dashboard/_ask/constants";
import { AskHeader } from "@/app/dashboard/_ask/AskHeader";
import { AttachmentList } from "@/app/dashboard/_ask/AttachmentList";
import { BookPicker } from "@/app/dashboard/_ask/BookPicker";
import { ComposerToolbar } from "@/app/dashboard/_ask/ComposerToolbar";
import { GeneratingCard } from "@/app/dashboard/_ask/Parts";
import { PackChapter } from "@/app/dashboard/_ask/PackChapter";
import { ResultSection } from "@/app/dashboard/_ask/ResultSection";
import { TabPicker } from "@/app/dashboard/_ask/TabPicker";
import { blockedReason, buildRequestBody, questionProblem, type Question } from "@/app/dashboard/_ask/build-request";
import { useAttachments } from "@/app/dashboard/_ask/useAttachments";
import { useBooks } from "@/app/dashboard/_ask/useBooks";
import { useGeneration } from "@/app/dashboard/_ask/useGeneration";
import { Alert, cx } from "@/components/ui";
import type { GenerationTaskType } from "@/types/database";

export default function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(() => peek<MeResponse>("me") ?? null);
  const [tab, setTab] = useState<GenerationTaskType>("solution");
  const [prompt, setPrompt] = useState("");
  // Sample papers: total marks to aim for (Indian school papers are often 80).
  const [totalMarks, setTotalMarks] = useState("80");
  const [dragging, setDragging] = useState(false);
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
  // The chapter for a study pack: the one picked, else the newest book.
  const chosenPackBook = packBookId ?? books.books[0]?.id ?? "";
  const currentTab = TABS.find((t) => t.value === tab)!;
  const isPack = tab === "study_pack";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (generation.isBusy() || readingFiles) return;
    const question: Question = {
      task: tab,
      prompt,
      totalMarks,
      language,
      packBookId: chosenPackBook,
      bookIds: books.activeIds,
      photos,
      docs,
    };

    // A question that is only a calculation ("Divide 5255 by 5", "LCM of 12, 18 and 30") is answered by code: exact, instant, and no AI used.
    if ((tab === "solution" || tab === "ad_hoc") && photos.length === 0 && docs.length === 0) {
      const problem = pureProblem(prompt, language);
      const example = problem ? solve(problem) : null;
      if (problem && example) {
        generation.showWorked(example, problem);
        return;
      }
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

  async function makeNewAnswer() {
    const again = generation.resend();
    if (!again) return;
    setTab(again.task);
    if (await again.done) attachments.clear();
  }

  const noBookSelected = !isPack && books.books.length > 0 && books.activeIds.length === 0;
  const overQuota = me?.quota.overQuota ?? false;
  const blocked = blockedReason({ overQuota, noBookSelected, readingFiles });
  const hasInput = Boolean(prompt.trim()) || photos.length > 0 || docs.length > 0;

  return (
    <div className="space-y-6">
      <AskHeader me={me} overQuota={overQuota} booksFailed={books.failed} noBooks={books.loaded && books.books.length === 0} />

      <TabPicker tab={tab} onChoose={chooseTab} />

      <form
        onSubmit={submit}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void attachments.add(e.dataTransfer.files);
        }}
        className={cx(
          "relative rounded-2xl border bg-white shadow-xs transition print:hidden",
          dragging ? "border-brand-500 ring-4 ring-brand-100" : "border-slate-200 focus-within:border-slate-300 focus-within:shadow-sm"
        )}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-brand-50/90 text-sm font-medium text-brand-700">
            Drop photos, a PDF or a Word file to attach
          </div>
        )}

        {isPack && <PackChapter books={books.books} value={chosenPackBook} onChange={setPackBookId} />}

        <label htmlFor="prompt" className="sr-only">
          Your question
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (files.length) {
              e.preventDefault();
              void attachments.add(files);
            }
          }}
          placeholder={currentTab.placeholder}
          rows={4}
          className="block max-h-[50vh] min-h-32 w-full resize-none rounded-t-2xl border-0 bg-transparent px-4 pt-4 pb-2 text-base text-slate-900 placeholder:text-slate-400 [field-sizing:content] focus:ring-0 focus:outline-none focus-visible:outline-none sm:px-5 sm:text-[15px]"
        />

        {!hasInput && currentTab.examples.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-3 sm:px-5">
            {currentTab.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        <AttachmentList
          photos={photos}
          docs={docs}
          reading={readingFiles}
          onRemovePhoto={attachments.removePhoto}
          onRemoveDoc={attachments.removeDoc}
        />

        {books.books.length > 0 && showBooks && !isPack && (
          <BookPicker
            books={books.books}
            activeIds={books.activeIds}
            onAll={books.selectAll}
            onNone={books.selectNone}
            onToggle={books.toggle}
          />
        )}

        <ComposerToolbar
          isPack={isPack}
          isSamplePaper={tab === "sample_paper"}
          photoCount={photos.length}
          bookCount={books.books.length}
          activeCount={books.activeIds.length}
          booksOpen={showBooks}
          totalMarks={totalMarks}
          language={language}
          loading={generation.loading}
          readingFiles={readingFiles}
          noBookSelected={noBookSelected}
          overQuota={overQuota}
          blocked={blocked}
          onAttach={(files) => void attachments.add(files)}
          onToggleBooks={() => setShowBooks((v) => !v)}
          onTotalMarks={setTotalMarks}
          onLanguage={setAnswerLanguage}
        />
      </form>

      {blocked && !generation.loading && (
        <p id="generate-blocked" className="text-sm text-slate-600 print:hidden">
          {blocked}
        </p>
      )}
      {error && (
        <Alert tone="error" className="print:hidden">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="warning" className="print:hidden">
          {notice}
        </Alert>
      )}

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
