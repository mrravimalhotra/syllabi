"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AnswerLanguage } from "@/lib/generation/language";
import { keep, peek } from "@/lib/client-cache";
import { PACK_WAIT_STEPS, ROUTE_BY_TASK, TABS, WAIT_STEPS, type MeResponse, usesBooks } from "@/app/dashboard/_ask/constants";
import { AskHeader } from "@/app/dashboard/_ask/AskHeader";
import { Messages } from "@/app/dashboard/_ask/Messages";
import { GeneratingCard } from "@/app/dashboard/_ask/Parts";
import { ResultSection } from "@/app/dashboard/_ask/ResultSection";
import { AskHome } from "@/app/dashboard/_ask/AskHome";
import { AskComposer } from "@/app/dashboard/_ask/AskComposer";
import { ActivityScreen } from "@/components/menu/Tiles";
import { PageSkeleton } from "@/components/ui";
import { planCommand, type QuickCommand } from "@/app/dashboard/_ask/commands";
import { blockedReason, buildRequestBody, calculationAnswer, questionProblem, type Question } from "@/app/dashboard/_ask/build-request";
import { useAttachments } from "@/app/dashboard/_ask/useAttachments";
import { useBooks } from "@/app/dashboard/_ask/useBooks";
import { useGeneration } from "@/app/dashboard/_ask/useGeneration";
import type { GenerationTaskType } from "@/types/database";


/** The tool named in the address (/dashboard?tool=solution), or null for the home of tiles. */
function toolFrom(value: string | null): GenerationTaskType | null {
  return TABS.find((t) => t.value === value)?.value ?? null;
}

/** The answer to offer again on the home: one still being made, or the last one made, with its tool. */
function lastAnswerOf(
  task: GenerationTaskType | null,
  generation: { loading: boolean; result: unknown; worked: unknown }
): { task: GenerationTaskType; loading: boolean } | null {
  if (task === null || !(generation.loading || generation.result || generation.worked)) return null;
  return { task, loading: generation.loading };
}

export default function DashboardPage() {
  // The tool comes from the address, which is only known in the browser.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AskSyllabi />
    </Suspense>
  );
}

/**
 * Ask Syllabi, laid out like Practice: a home of tiles (AskHome), and each kind of thing to make on its own
 * screen with the question box. The screen is in the address, so the phone's back button returns to the tiles.
 */
function AskSyllabi() {
  const router = useRouter();
  const params = useSearchParams();
  const tool = toolFrom(params.get("tool"));
  const tab: GenerationTaskType = tool ?? "solution";
  // The tool the answer on screen (or being made) belongs to, and the tool last opened.
  const [answerTask, setAnswerTask] = useState<GenerationTaskType | null>(null);
  const [lastTool, setLastTool] = useState<GenerationTaskType | null>(tool);
  const [me, setMe] = useState<MeResponse | null>(() => peek<MeResponse>("me") ?? null);
  // A question passed in the address (Homework's "Get help") starts in the box, ready to send or change.
  const [prompt, setPrompt] = useState(() => (params.get("q") ?? "").slice(0, 2000));
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
    setAnswerTask(tab);
    if (await generation.send(ROUTE_BY_TASK[tab], buildRequestBody(question), tab)) attachments.clear();
  }

  /**
   * Opens a tool's screen. Another tool starts afresh (its text and attachments are cleared, and the last
   * answer too unless it is still being made, which carries on and can be reopened from the home).
   */
  function openTool(next: GenerationTaskType) {
    if (next !== lastTool) {
      setPrompt("");
      attachments.clear();
      if (!generation.isBusy() && next !== answerTask) {
        generation.clear();
        setAnswerTask(null);
      }
      setLastTool(next);
    }
    router.push(`/dashboard?tool=${next}`, { scroll: true });
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
    setAnswerTask(again.task);
    if (again.task !== tool) router.replace(`/dashboard?tool=${again.task}`, { scroll: false });
    if (await again.done) attachments.clear();
  }

  const noBookSelected = usesBooks(tab) && books.books.length > 0 && books.activeIds.length === 0;
  const overQuota = me?.quota.overQuota ?? false;
  const blocked = blockedReason({ overQuota, noBookSelected, readingFiles, choosingPages: attachments.longPdfs.length > 0 });

  const header = (greeting: boolean) => (
    <AskHeader me={me} overQuota={overQuota} booksFailed={books.failed} noBooks={books.loaded && books.books.length === 0} greeting={greeting} />
  );
  if (!tool) {
    return (
      <div className="space-y-6">
        {header(true)}
        <AskHome onOpen={openTool} lastAnswer={lastAnswerOf(answerTask, generation)} />
      </div>
    );
  }
  // The answer shown here is this tool's (an answer of another tool still being made waits on the home).
  const answerHere = answerTask === null || answerTask === tab;

  return (
    <div className="space-y-6">
      <ActivityScreen
        emoji={currentTab.emoji}
        tone={currentTab.group === "homework" ? "sky" : "amber"}
        title={currentTab.tileTitle}
        description={`You'll get ${currentTab.gets}. Give ${currentTab.gives}.`}
        onBack={() => router.push("/dashboard")}
        backLabel="← All tools"
      />
      {header(false)}

      <AskComposer
        tab={tab}
        prompt={prompt}
        onPrompt={setPrompt}
        onSubmit={submit}
        attachments={attachments}
        books={books}
        showBooks={showBooks}
        onShowBooks={setShowBooks}
        packBookId={chosenPackBook}
        onPackBook={setPackBookId}
        onCommand={runCommand}
        totalMarks={totalMarks}
        onTotalMarks={setTotalMarks}
        marksEach={marksEach}
        onMarksEach={setMarksEach}
        language={language}
        onLanguage={setAnswerLanguage}
        loading={generation.loading}
        noBookSelected={noBookSelected}
        overQuota={overQuota}
        blocked={blocked}
      />

      <Messages blocked={generation.loading ? null : blocked} error={error} notice={notice} />

      {answerHere && generation.loading && (
        <GeneratingCard steps={isPack ? PACK_WAIT_STEPS : WAIT_STEPS} draft={generation.draft} stage={generation.stage} onStop={generation.stop} />
      )}

      <ResultSection
        worked={answerHere ? generation.worked : null}
        result={answerHere ? generation.result : null}
        resultRef={generation.resultRef}
        workedInQuestion={generation.workedInQuestion}
        openWorked={generation.openWorked}
        onOpenWorked={generation.setOpenWorked}
        onMakeNewAnswer={makeNewAnswer}
      />
    </div>
  );
}
