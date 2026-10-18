"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DownscaledImage } from "@/lib/downscale-image";
import { findProblems, pureProblem, solve } from "@/lib/worked/detect";
import type { WorkedExample } from "@/lib/worked/types";
import { LANGUAGE_NAMES, type AnswerLanguage } from "@/lib/generation/language";
import { keep, peek } from "@/lib/client-cache";
import { readAnswerStream } from "@/lib/answer-stream";
import {
  ACCEPTED_FILES,
  MAX_ATTACHED_TEXT_CHARS,
  MAX_PHOTOS,
  PACK_WAIT_STEPS,
  ROUTE_BY_TASK,
  TABS,
  WAIT_STEPS,
  type Book,
  type GenerationResult,
  type MeResponse,
} from "@/app/dashboard/_ask/constants";
import { GeneratingCard, Thumb } from "@/app/dashboard/_ask/Parts";
import { readAttachments } from "@/app/dashboard/_ask/attachments";
import { ResultSection } from "@/app/dashboard/_ask/ResultSection";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import {
  BookIcon,
  DocumentIcon,
  PaperclipIcon,
  SparklesIcon,
  XIcon,
} from "@/components/icons";
import { Alert, Meter, Spinner, button, cx, input, link } from "@/components/ui";
import type { GenerationTaskType } from "@/types/database";

export default function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(() => peek<MeResponse>("me") ?? null);
  const [tab, setTab] = useState<GenerationTaskType>("solution");
  const [prompt, setPrompt] = useState("");
  // Sample papers: total marks to aim for (Indian school papers are often 80).
  const [totalMarks, setTotalMarks] = useState("80");
  const [loading, setLoading] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  // A calculation answered by code alone (no AI): its worked example, and its id once saved.
  const [worked, setWorked] = useState<{ example: WorkedExample; id: string | null } | null>(null);
  // Calculations found in the last question, offered as "See it worked out" under an AI answer.
  const [openWorked, setOpenWorked] = useState<number | null>(null);
  // Photos attached to the question (e.g. a homework page), downscaled in the
  // browser so they fit the request size limit.
  const [photos, setPhotos] = useState<DownscaledImage[]>([]);
  // Word files attached to the question: their text goes with the question.
  const [attachedDocs, setAttachedDocs] = useState<{ name: string; text: string }[]>([]);
  const [dragging, setDragging] = useState(false);

  // The user's own books; answers search only the ones ticked (all by default).
  const [books, setBooks] = useState<Book[]>(() => peek<Book[]>("books") ?? []);
  const [selectedBookIds, setSelectedBookIds] = useState<string[] | null>(null);
  const [booksLoaded, setBooksLoaded] = useState(() => peek("books") !== undefined);
  const [booksError, setBooksError] = useState(false);
  const [showBooks, setShowBooks] = useState(false);
  // Language for this question; until changed, the Account page's default.
  const [answerLanguage, setAnswerLanguage] = useState<AnswerLanguage | null>(null);
  // Study packs: the chapter (a book from My books); "" means use attached pages.
  const [packBookId, setPackBookId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  // The last request sent, kept for finding the calculations in the question just answered.
  const [lastBody, setLastBody] = useState<Record<string, unknown> | null>(null);
  // The answer as written so far (streamed), shown while it is still being made.
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const draftFrame = useRef<number | null>(null);
  const lastRequestRef = useRef<{ route: string; body: Record<string, unknown>; task: GenerationTaskType } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function loadMe() {
    const res = await fetch("/api/me");
    const data = await res.json().catch(() => null);
    if (res.ok && data) setMe(keep("me", data));
  }

  async function loadBooks() {
    try {
      const res = await fetch("/api/library?progress=0");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBooks(keep("books", (data.documents as Book[]).filter((b) => b.status === "ready")));
      setBooksLoaded(true);
    } catch {
      setBooksError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount is intentional here
    loadMe();
    loadBooks();
  }, []);

  // Leaving the page while an answer is being written loses the wait (the
  // answer is still saved): ask first.
  useEffect(() => {
    if (!loading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [loading]);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const activeBookIds = selectedBookIds ?? books.map((b) => b.id);
  const language: AnswerLanguage = answerLanguage ?? me?.student.answer_language ?? "auto";
  // The chapter for a study pack: the one picked, else the newest book.
  const chosenPackBook = packBookId ?? books[0]?.id ?? "";
  const currentTab = TABS.find((t) => t.value === tab)!;

  function toggleBook(id: string) {
    setSelectedBookIds((prev) => {
      const current = prev ?? books.map((b) => b.id);
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  }

  async function addAttachments(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setNotice(null);
    setReadingFiles(true);
    const read = await readAttachments(Array.from(files), photos);
    if ("error" in read) {
      setError(read.error);
    } else {
      setPhotos(read.photos);
      setAttachedDocs((prev) => [...prev, ...read.docs]);
      if (read.notes.length) setNotice(read.notes.join(" "));
    }
    setReadingFiles(false);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    // A ref, not state: two quick triggers (double click, Ctrl+Enter) in the
    // same moment would both still see the old state.
    if (busyRef.current || readingFiles) return;
    const isPack = tab === "study_pack";

    // A question that is only a calculation ("Divide 5255 by 5", "LCM of 12,
    // 18 and 30") is answered by code: exact, instant, and no AI used.
    if ((tab === "solution" || tab === "ad_hoc") && photos.length === 0 && attachedDocs.length === 0) {
      const problem = pureProblem(prompt, language);
      const example = problem ? solve(problem) : null;
      if (problem && example) {
        setError(null);
        setNotice(null);
        setResult(null);
        setWorked({ example, id: null });
        lastRequestRef.current = null;
        fetch("/api/worked", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problem }),
        })
          .then((r) => r.json())
          .then((data) => data?.id && setWorked((w) => (w && w.example === example ? { ...w, id: data.id } : w)))
          .catch(() => {});
        return;
      }
    }

    if (isPack && !chosenPackBook && photos.length === 0) {
      setError("Choose the chapter from My books, or attach photos or a PDF of it.");
      return;
    }
    if (!isPack && !prompt.trim() && photos.length === 0 && attachedDocs.length === 0) {
      setError("Type a question or attach a photo or file first.");
      return;
    }
    const body = isPack
      ? {
          documentId: chosenPackBook || undefined,
          photos: chosenPackBook ? [] : photos.map((p) => ({ data: p.imageBase64, mimeType: p.mimeType, text: p.text })),
          focus: prompt.trim(),
          language,
        }
      : {
          prompt: tab === "sample_paper" ? `${prompt.trim()}\n\nTotal marks: ${totalMarks}`.trim() : prompt.trim(),
          documentIds: activeBookIds,
          language,
          photos: photos.map((p) => ({ data: p.imageBase64, mimeType: p.mimeType, text: p.text })),
          attachedText: attachedDocs
            .map((d) => `Attached file "${d.name}":\n${d.text}`)
            .join("\n\n")
            .slice(0, MAX_ATTACHED_TEXT_CHARS),
        };
    await send(ROUTE_BY_TASK[tab], body, tab);
  }

  /** Switching kind starts that kind afresh: the text, attachments, messages and the last answer from the other kind are cleared. */
  function chooseTab(next: GenerationTaskType) {
    if (next === tab || busyRef.current) return;
    setTab(next);
    setPrompt("");
    setPhotos([]);
    setAttachedDocs([]);
    setError(null);
    setNotice(null);
    setResult(null);
    setWorked(null);
    setOpenWorked(null);
  }

  /** Sends one request; also used by "Make a new answer", which resends the last one with fresh: true. */
  async function send(route: string, body: Record<string, unknown>, task: GenerationTaskType) {
    busyRef.current = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    setResult(null);
    setWorked(null);
    setOpenWorked(null);
    lastRequestRef.current = { route, body, task };
    setLastBody(body);
    draftRef.current = "";
    setDraft("");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Answers (not study packs) are streamed, so the first words show within seconds.
      const streaming = task !== "study_pack";
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(streaming ? { ...body, stream: true } : body),
      });
      let data;
      if (res.ok && res.body && (res.headers.get("content-type") ?? "").includes("application/x-ndjson")) {
        data = await readAnswerStream<GenerationResult>(res.body, {
          onText: (delta) => {
            draftRef.current += delta;
            if (draftFrame.current === null) {
              draftFrame.current = requestAnimationFrame(() => {
                draftFrame.current = null;
                setDraft(draftRef.current);
              });
            }
          },
          onReset: () => {
            draftRef.current = "";
            setDraft("");
          },
        });
      } else {
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "make your answer"));
      }
      setLoading(false);
      setResult(data);
      setPhotos([]);
      setAttachedDocs([]);
      // Refresh the usage bar in the background; the answer is already shown.
      loadMe().catch(() => {});
    } catch (err) {
      if (controller.signal.aborted) {
        setNotice("You stopped waiting. If the answer still finishes, it will appear in My Documents.");
      } else {
        setError(
          err instanceof TypeError
            ? OFFLINE_MESSAGE
            : err instanceof Error
              ? err.message
              : "Couldn't make your answer. Check your connection and try again."
        );
      }
    } finally {
      abortRef.current = null;
      busyRef.current = false;
      if (draftFrame.current !== null) cancelAnimationFrame(draftFrame.current);
      draftFrame.current = null;
      draftRef.current = "";
      setDraft("");
      setLoading(false);
    }
  }

  function makeNewAnswer() {
    const last = lastRequestRef.current;
    if (!last || busyRef.current) return;
    setTab(last.task);
    send(last.route, { ...last.body, fresh: true }, last.task);
  }

  // Calculations in the question just answered, each with its worked example.
  const workedInQuestion = useMemo(() => {
    if (!result || !lastBody) return [];
    const text = [lastBody.prompt, lastBody.attachedText].filter((t) => typeof t === "string").join("\n");
    return findProblems(text, typeof lastBody.language === "string" ? lastBody.language : undefined)
      .slice(0, 6)
      .map((f) => solve(f.problem))
      .filter((e): e is WorkedExample => e !== null);
  }, [result, lastBody]);

  const noBookSelected = tab !== "study_pack" && books.length > 0 && activeBookIds.length === 0;
  const overQuota = me?.quota.overQuota ?? false;
  // Why the Generate button is off, so a disabled button is never a mystery.
  const blockedReason = overQuota
    ? "Generate is paused: you've used this month's allowance (see the message above)."
    : noBookSelected
      ? "Generate is off because no book is selected. Under “Search these books”, tap a book, or tap All."
      : readingFiles
        ? "Preparing your attachment. Generate turns on when it's ready."
        : null;
  const hasInput = Boolean(prompt.trim()) || photos.length > 0 || attachedDocs.length > 0;
  const firstName = me?.student.full_name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {firstName ? `Hi ${firstName}, what shall we work on?` : "What shall we work on?"}
          </h1>
          <p className="text-sm text-slate-500">Pick what you need, then ask. Answers come from your uploaded books and can be printed or saved as a PDF.</p>
        </div>
        {me && (
          <Link
            href="/dashboard/account"
            className="w-full max-w-56 space-y-1.5 rounded-xl px-1 py-1 text-xs text-slate-500 hover:text-slate-700 sm:w-56"
          >
            <span className="flex justify-between">
              <span>This month</span>
              <span className="tabular-nums">{Math.min(100, Math.round((me.quota.used / Math.max(me.quota.quota, 1)) * 100))}% used</span>
            </span>
            <Meter value={me.quota.used} max={me.quota.quota} label="Monthly usage" />
          </Link>
        )}
      </div>

      {overQuota && (
        <Alert tone="error" className="print:hidden">
          You&apos;ve used all of this month&apos;s allowance, so new answers are paused. It resets on the 1st. To get more now, ask the person who runs
          Syllabi for you to raise your limit (Admin → Accounts). Saved answers, worked examples and Practice still work.
        </Alert>
      )}
      {booksError && (
        <Alert tone="error" className="print:hidden">
          Couldn&apos;t load your books, so answers won&apos;t use them. Check your connection and reload the page.
        </Alert>
      )}
      {booksLoaded && books.length === 0 && (
        <Alert tone="info" className="print:hidden">
          Add your child&apos;s or student&apos;s books in{" "}
          <Link href="/dashboard/library" className="font-medium underline">
            My books
          </Link>{" "}
          so answers come from them. Until then, Syllabi answers from general knowledge.
        </Alert>
      )}

      <div role="radiogroup" aria-label="What to make" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 print:hidden [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => chooseTab(t.value)}
              className={cx(
                "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                selected
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <span
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className={cx("block text-sm font-semibold", selected ? "text-brand-900" : "text-slate-900")}>
                  {t.label}
                </span>
                <span className="block truncate text-xs text-slate-500">{t.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <form
        ref={formRef}
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
          addAttachments(e.dataTransfer.files);
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

        {tab === "study_pack" && (
          <div className="space-y-2 border-b border-slate-100 px-4 pt-4 pb-3 sm:px-5">
            <label htmlFor="pack-book" className="text-sm font-medium text-slate-900">
              Which chapter?
            </label>
            {books.length > 0 ? (
              <select
                id="pack-book"
                value={chosenPackBook}
                onChange={(e) => setPackBookId(e.target.value)}
                className={cx(input, "max-w-xl")}
              >
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                    {b.subject || b.grade ? ` (${[b.subject, b.grade].filter(Boolean).join(", ")})` : ""}
                  </option>
                ))}
                <option value="">Use the pages I attach below</option>
              </select>
            ) : (
              <p className="text-xs text-slate-500">
                Attach the chapter&apos;s pages below, or add it to{" "}
                <Link href="/dashboard/library" className={link}>
                  My books
                </Link>{" "}
                first (best for long chapters: it&apos;s read once and quotes can be checked).
              </p>
            )}
            <p className="text-xs text-slate-500">
              Makes a walkthrough with read-aloud, answers to every textbook question, a practice test and a glossary.
              Takes one to three minutes.
            </p>
          </div>
        )}

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
              submit();
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (files.length) {
              e.preventDefault();
              addAttachments(files);
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

        {(photos.length > 0 || attachedDocs.length > 0 || readingFiles) && (
          <ul className="flex flex-wrap gap-3 px-4 pb-3 sm:px-5" aria-label="Attachments">
            {photos.map((p, i) => (
              <li key={i} className="relative">
                <Thumb image={p} alt={`Attached page ${i + 1}`} />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow ring-2 ring-white"
                  aria-label={`Remove page ${i + 1}`}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {attachedDocs.map((d, i) => (
              <li
                key={d.name + i}
                className="flex h-16 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 pr-1 pl-3 text-xs text-slate-700"
              >
                <DocumentIcon className="h-4.5 w-4.5 text-brand-600" />
                <span className="max-w-40 truncate">{d.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachedDocs((prev) => prev.filter((_, j) => j !== i))}
                  className={button.icon}
                  aria-label={`Remove ${d.name}`}
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
            {readingFiles && (
              <li className="flex h-16 items-center gap-2 px-2 text-xs text-slate-500">
                <Spinner /> Reading files...
              </li>
            )}
          </ul>
        )}

        {books.length > 0 && showBooks && tab !== "study_pack" && (
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">Search these books</p>
              <div className="flex gap-3 text-xs">
                <button type="button" className={link} onClick={() => setSelectedBookIds(null)}>
                  All
                </button>
                <button type="button" className={link} onClick={() => setSelectedBookIds([])}>
                  None
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {books.map((b) => {
                const on = activeBookIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleBook(b.id)}
                    className={cx(
                      "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
                      on
                        ? "border-brand-500 bg-brand-50 text-brand-800"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    )}
                  >
                    <BookIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{b.title}</span>
                    {(b.subject || b.grade) && (
                      <span className="shrink-0 text-slate-400">{[b.subject, b.grade].filter(Boolean).join(", ")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-3 sm:px-4">
          <label
            className={cx(button.ghost, "cursor-pointer", photos.length >= MAX_PHOTOS && "pointer-events-none opacity-50")}
            title="Attach photos, a PDF or a Word file"
          >
            <PaperclipIcon className="h-4.5 w-4.5" />
            <span>Attach</span>
            <input
              type="file"
              accept={ACCEPTED_FILES}
              multiple
              className="sr-only"
              disabled={photos.length >= MAX_PHOTOS}
              onChange={(e) => {
                addAttachments(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {books.length > 0 && tab !== "study_pack" && (
            <button
              type="button"
              onClick={() => setShowBooks((v) => !v)}
              aria-expanded={showBooks}
              className={noBookSelected ? button.dangerGhost : button.ghost}
            >
              <BookIcon className="h-4.5 w-4.5" />
              {activeBookIds.length === books.length
                ? books.length === 1
                  ? "Your 1 book"
                  : `All ${books.length} books`
                : `${activeBookIds.length} of ${books.length} ${books.length === 1 ? "book" : "books"}`}
            </button>
          )}

          {tab === "sample_paper" && (
            <label className="inline-flex items-center gap-2 px-2 text-sm text-slate-600">
              Marks
              <select
                value={totalMarks}
                onChange={(e) => setTotalMarks(e.target.value)}
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
                onChange={(e) => setAnswerLanguage(e.target.value as AnswerLanguage)}
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
              aria-describedby={blockedReason ? "generate-blocked" : undefined}
              className={button.primary}
            >
              {loading ? <Spinner /> : <SparklesIcon className="h-4.5 w-4.5" />}
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </form>

      {blockedReason && !loading && (
        <p id="generate-blocked" className="text-sm text-slate-600 print:hidden">
          {blockedReason}
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

      {loading && (
        <GeneratingCard steps={tab === "study_pack" ? PACK_WAIT_STEPS : WAIT_STEPS} draft={draft} onStop={() => abortRef.current?.abort()} />
      )}

      <ResultSection
        worked={worked}
        result={result}
        resultRef={resultRef}
        workedInQuestion={workedInQuestion}
        openWorked={openWorked}
        onOpenWorked={setOpenWorked}
        onMakeNewAnswer={makeNewAnswer}
      />
    </div>
  );
}

/** One attachment preview. Memoised so typing doesn't rebuild large image strings. */
