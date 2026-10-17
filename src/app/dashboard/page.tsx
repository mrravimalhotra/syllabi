"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import { downscaleImageFile, imageFingerprint, type DownscaledImage } from "@/lib/downscale-image";
import { AnswerView, type Answer } from "@/components/AnswerView";
import {
  ArrowRightIcon,
  BookIcon,
  ChatIcon,
  CheckIcon,
  ClipboardIcon,
  DocumentIcon,
  ListCheckIcon,
  NotesIcon,
  PaperclipIcon,
  SparklesIcon,
  XIcon,
} from "@/components/icons";
import { Alert, Meter, Skeleton, Spinner, button, card, cx, link } from "@/components/ui";
import type { GenerationTaskType, Student } from "@/types/database";

// Attachments to a question: up to this many images (photos, PDF pages, Word
// pictures) within the request size budget, plus the text of Word files.
const MAX_PHOTOS = 12;
const MAX_ATTACHMENT_BASE64_CHARS = 3_000_000;
const MAX_ATTACHED_TEXT_CHARS = 20_000;
const ACCEPTED_FILES =
  "image/jpeg,image/png,image/webp,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface MeResponse {
  student: Student;
  quota: { used: number; quota: number; remaining: number; overQuota: boolean };
}

interface Book {
  id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  status: "processing" | "ready" | "failed";
}

type GenerationResult = Answer & { id: string | null };

const TABS: {
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
    placeholder: "Type or paste the question, or attach a photo of the worksheet...",
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
    placeholder: "Ask any study-related question...",
    examples: ["Ideas for a Class 6 science project on plants", "How should we plan revision for next week's test?"],
  },
];

const ROUTE_BY_TASK: Record<GenerationTaskType, string> = {
  solution: "/api/generate/solution",
  notes: "/api/generate/notes",
  sample_paper: "/api/generate/sample-paper",
  ad_hoc: "/api/generate/ad-hoc",
};

// What the person sees while waiting; the steps move on with time, since the
// server answers in one go.
const WAIT_STEPS = [
  { after: 0, text: "Reading your question and attachments" },
  { after: 4, text: "Finding the right pages in your books" },
  { after: 10, text: "Writing the answer" },
  { after: 45, text: "Still writing: a whole worksheet or paper can take a minute or two" },
];

export default function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tab, setTab] = useState<GenerationTaskType>("solution");
  const [prompt, setPrompt] = useState("");
  // Sample papers: total marks to aim for (Indian school papers are often 80).
  const [totalMarks, setTotalMarks] = useState("80");
  const [loading, setLoading] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  // Photos attached to the question (e.g. a homework page), downscaled in the
  // browser so they fit the request size limit.
  const [photos, setPhotos] = useState<DownscaledImage[]>([]);
  // Word files attached to the question: their text goes with the question.
  const [attachedDocs, setAttachedDocs] = useState<{ name: string; text: string }[]>([]);
  const [dragging, setDragging] = useState(false);

  // The user's own books; answers search only the ones ticked (all by default).
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<string[] | null>(null);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [booksError, setBooksError] = useState(false);
  const [showBooks, setShowBooks] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function loadMe() {
    const res = await fetch("/api/me");
    const data = await res.json().catch(() => null);
    if (res.ok && data) setMe(data);
  }

  async function loadBooks() {
    try {
      const res = await fetch("/api/library");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBooks((data.documents as Book[]).filter((b) => b.status === "ready"));
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
    const images: DownscaledImage[] = [];
    const docs: { name: string; text: string }[] = [];
    const notes: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const name = file.name.toLowerCase();
        if (name.endsWith(".docx")) {
          const { readDocx } = await import("@/lib/docx-to-text");
          const content = await readDocx(file);
          docs.push({ name: file.name, text: content.textPages.join("\n\n") });
          images.push(...content.pictures);
          if (content.skippedPictures.length) notes.push(`${file.name}: some pictures can't be read; save it as PDF if they matter.`);
        } else if (file.type === "application/pdf") {
          const { pdfToPageImages } = await import("@/lib/pdf-to-images");
          images.push(...(await pdfToPageImages(file, MAX_PHOTOS)));
        } else if (file.type.startsWith("image/")) {
          images.push(await downscaleImageFile(file));
        } else {
          notes.push(`${file.name}: not a photo, PDF or Word file, so it was skipped.`);
        }
      }
    } catch {
      setError("Couldn't read one of those files. Use photos (JPEG, PNG), PDF or Word (.docx).");
      setReadingFiles(false);
      return;
    }

    // Keep within the image count and the request size budget.
    const kept: DownscaledImage[] = [...photos];
    let size = kept.reduce((sum, p) => sum + p.imageBase64.length, 0);
    let dropped = 0;
    // Skip a photo or page that is already attached.
    const seen = new Set(kept.map((p) => imageFingerprint(p.imageBase64)));
    for (const image of images) {
      const fingerprint = imageFingerprint(image.imageBase64);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      if (kept.length < MAX_PHOTOS && size + image.imageBase64.length <= MAX_ATTACHMENT_BASE64_CHARS) {
        kept.push(image);
        size += image.imageBase64.length;
      } else dropped++;
    }
    if (dropped) notes.push(`${dropped} page(s) or picture(s) left out: up to ${MAX_PHOTOS} images per question.`);
    setPhotos(kept);
    setAttachedDocs((prev) => [...prev, ...docs]);
    if (notes.length) setNotice(notes.join(" "));
    setReadingFiles(false);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    // A ref, not state: two quick triggers (double click, Ctrl+Enter) in the
    // same moment would both still see the old state.
    if (busyRef.current || readingFiles) return;
    if (!prompt.trim() && photos.length === 0 && attachedDocs.length === 0) {
      setError("Type a question or attach a photo or file first.");
      return;
    }
    busyRef.current = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(ROUTE_BY_TASK[tab], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: tab === "sample_paper" ? `${prompt.trim()}\n\nTotal marks: ${totalMarks}`.trim() : prompt.trim(),
          documentIds: activeBookIds,
          photos: photos.map((p) => ({ data: p.imageBase64, mimeType: p.mimeType })),
          attachedText: attachedDocs
            .map((d) => `Attached file "${d.name}":\n${d.text}`)
            .join("\n\n")
            .slice(0, MAX_ATTACHED_TEXT_CHARS),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate an answer right now. Please try again.");
      setLoading(false);
      setResult(data);
      setPhotos([]);
      setAttachedDocs([]);
      // Refresh the usage bar in the background; the answer is already shown.
      loadMe().catch(() => {});
    } catch (err) {
      if (controller.signal.aborted) {
        setNotice("Stopped waiting. If the answer finishes anyway, it will appear in My Documents.");
      } else {
        setError(
          err instanceof TypeError
            ? "Couldn't reach Syllabi. Check your connection and try again."
            : err instanceof Error
              ? err.message
              : "Generation failed"
        );
      }
    } finally {
      abortRef.current = null;
      busyRef.current = false;
      setLoading(false);
    }
  }

  const noBookSelected = books.length > 0 && activeBookIds.length === 0;
  const overQuota = me?.quota.overQuota ?? false;
  const hasInput = Boolean(prompt.trim()) || photos.length > 0 || attachedDocs.length > 0;
  const firstName = me?.student.full_name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {firstName ? `Hi ${firstName}, what shall we work on?` : "What shall we work on?"}
          </h1>
          <p className="text-sm text-slate-500">Answers come from your books, step by step, ready to print.</p>
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
          You&apos;ve used this month&apos;s allowance. Ask an admin to raise your limit.
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

      <div role="radiogroup" aria-label="What to make" className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:hidden">
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTab(t.value)}
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

        {!hasInput && (
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

        {books.length > 0 && showBooks && (
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

          {books.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBooks((v) => !v)}
              aria-expanded={showBooks}
              className={noBookSelected ? button.dangerGhost : button.ghost}
            >
              <BookIcon className="h-4.5 w-4.5" />
              {activeBookIds.length === books.length ? `All ${books.length} books` : `${activeBookIds.length} of ${books.length} books`}
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
            <span className="hidden text-xs text-slate-400 lg:inline">Ctrl + Enter</span>
            <button
              type="submit"
              disabled={loading || readingFiles || noBookSelected || overQuota}
              className={button.primary}
            >
              {loading ? <Spinner /> : <SparklesIcon className="h-4.5 w-4.5" />}
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </form>

      {noBookSelected && (
        <p className="text-xs text-red-600 print:hidden">Pick at least one book to search, or choose All.</p>
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

      {loading && <GeneratingCard onStop={() => abortRef.current?.abort()} />}

      {result && (
        <div ref={resultRef} className="space-y-3">
          <AnswerView answer={result} />
          {result.id && (
            <p className="text-center text-xs text-slate-500 print:hidden">
              Saved to{" "}
              <Link href={`/dashboard/documents/${result.id}`} className={link}>
                My Documents <ArrowRightIcon className="inline h-3 w-3" />
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One attachment preview. Memoised so typing doesn't rebuild large image strings. */
const Thumb = memo(function Thumb({ image, alt }: { image: DownscaledImage; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
    <img
      src={`data:${image.mimeType};base64,${image.imageBase64}`}
      alt={alt}
      decoding="async"
      className="h-16 w-auto max-w-28 rounded-lg border border-slate-200 object-cover"
    />
  );
});

/** Shown while an answer is being written: progress steps and a placeholder answer. */
function GeneratingCard({ onStop }: { onStop: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const step = WAIT_STEPS.filter((s) => seconds >= s.after).length - 1;

  return (
    <div className={cx(card, "animate-fade-in space-y-5 p-5 sm:p-6 print:hidden")} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <ol className="space-y-2.5">
          {WAIT_STEPS.slice(0, 3).map((s, i) => {
            const done = i < step;
            const current = i === Math.min(step, 2);
            return (
              <li key={s.text} className={cx("flex items-center gap-2.5 text-sm", done || current ? "text-slate-900" : "text-slate-400")}>
                <span
                  className={cx(
                    "flex h-5 w-5 items-center justify-center rounded-full",
                    done ? "bg-brand-600 text-white" : current ? "text-brand-600" : "bg-slate-100"
                  )}
                >
                  {done ? <CheckIcon className="h-3.5 w-3.5" /> : current ? <Spinner className="h-4 w-4" /> : null}
                </span>
                {s.text}
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={onStop} className={button.small}>
          Stop
        </button>
      </div>
      {step === 3 && <p className="text-xs text-slate-500">{WAIT_STEPS[3].text}. Keep this page open.</p>}
      <div className="space-y-2.5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <p className="text-xs tabular-nums text-slate-400">{seconds}s</p>
    </div>
  );
}
