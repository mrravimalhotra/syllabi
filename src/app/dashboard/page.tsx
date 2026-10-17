"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { downscaleImageFile, type DownscaledImage } from "@/lib/downscale-image";
import { AnswerView, type Answer } from "@/components/AnswerView";
import type { GenerationTaskType, Student } from "@/types/database";

// Attachments to a question: up to this many images (photos, PDF pages, Word
// pictures) within the request size budget, plus the text of Word files.
const MAX_PHOTOS = 12;
const MAX_ATTACHMENT_BASE64_CHARS = 3_000_000;
const MAX_ATTACHED_TEXT_CHARS = 20_000;

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

const TABS: { value: GenerationTaskType; label: string; placeholder: string }[] = [
  { value: "solution", label: "Step-by-step solution", placeholder: "Paste the question you need solved..." },
  { value: "notes", label: "Revision notes", placeholder: "Which topic should the notes cover?" },
  { value: "sample_paper", label: "Sample paper", placeholder: "Which topic/syllabus scope should the paper cover?" },
  { value: "ad_hoc", label: "Ask anything", placeholder: "Ask any study-related question..." },
];

const ROUTE_BY_TASK: Record<GenerationTaskType, string> = {
  solution: "/api/generate/solution",
  notes: "/api/generate/notes",
  sample_paper: "/api/generate/sample-paper",
  ad_hoc: "/api/generate/ad-hoc",
};

export default function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tab, setTab] = useState<GenerationTaskType>("solution");
  const [prompt, setPrompt] = useState("");
  // Sample papers: total marks to aim for (Indian school papers are often 80).
  const [totalMarks, setTotalMarks] = useState("80");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  // Photos attached to the question (e.g. a homework page), downscaled in the
  // browser so they fit the request size limit.
  const [photos, setPhotos] = useState<DownscaledImage[]>([]);
  // Word files attached to the question: their text goes with the question.
  const [attachedDocs, setAttachedDocs] = useState<{ name: string; text: string }[]>([]);

  // The user's own books; answers search only the ones ticked (all by default).
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<string[] | null>(null);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [booksError, setBooksError] = useState(false);

  async function loadMe() {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (res.ok) setMe(data);
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

  const activeBookIds = selectedBookIds ?? books.map((b) => b.id);

  function toggleBook(id: string) {
    setSelectedBookIds((prev) => {
      const current = prev ?? books.map((b) => b.id);
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  }

  async function addAttachments(files: FileList | null) {
    if (!files) return;
    setError(null);
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
        } else {
          images.push(await downscaleImageFile(file));
        }
      }
    } catch {
      setError("Couldn't read one of those files. Use photos (JPEG, PNG), PDF or Word (.docx).");
      return;
    }

    // Keep within the image count and the request size budget.
    const kept: DownscaledImage[] = [...photos];
    let size = kept.reduce((sum, p) => sum + p.imageBase64.length, 0);
    let dropped = 0;
    for (const image of images) {
      if (kept.length < MAX_PHOTOS && size + image.imageBase64.length <= MAX_ATTACHMENT_BASE64_CHARS) {
        kept.push(image);
        size += image.imageBase64.length;
      } else dropped++;
    }
    if (dropped) notes.push(`${dropped} page(s) or picture(s) left out: up to ${MAX_PHOTOS} images per question.`);
    setPhotos(kept);
    setAttachedDocs((prev) => [...prev, ...docs]);
    if (notes.length) setError(notes.join(" "));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() && photos.length === 0 && attachedDocs.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(ROUTE_BY_TASK[tab], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setResult(data);
      setPhotos([]);
      setAttachedDocs([]);
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  const noBookSelected = books.length > 0 && activeBookIds.length === 0;

  return (
    <div className="space-y-6">
      {me && (
        <div className="print:hidden">
          <QuotaBar used={me.quota.used} quota={me.quota.quota} />
        </div>
      )}

      {booksError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
          Couldn&apos;t load your books, so answers won&apos;t use them. Check your connection and reload the page.
        </p>
      )}

      {booksLoaded && books.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 print:hidden">
          Add your child&apos;s or student&apos;s books in{" "}
          <Link href="/dashboard/library" className="font-medium underline">
            My books
          </Link>{" "}
          so answers come from them. Until then, Syllabi answers from general knowledge.
        </p>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:flex print:hidden">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`min-h-11 rounded-md px-2 py-2 text-sm font-medium transition sm:min-h-0 sm:flex-1 sm:px-3 ${
              tab === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 print:hidden">
        {books.length > 0 && (
          <div className="border-b border-slate-100 pb-3">
            <p className="text-xs font-medium text-slate-500">Use these books</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {books.map((b) => (
                <label key={b.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" checked={activeBookIds.includes(b.id)} onChange={() => toggleBook(b.id)} />
                  {b.title}
                  {(b.subject || b.grade) && (
                    <span className="text-xs text-slate-400">({[b.subject, b.grade].filter(Boolean).join(", ")})</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
        {tab === "sample_paper" && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Total marks
            <select
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {["20", "40", "80", "100"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={TABS.find((t) => t.value === tab)?.placeholder}
          rows={4}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-slate-500 focus:outline-none sm:text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
              <img
                src={`data:${p.mimeType};base64,${p.imageBase64}`}
                alt={`Attached photo ${i + 1}`}
                className="h-16 w-auto rounded-md border border-slate-200"
              />
              <button
                type="button"
                onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -right-2 -top-2 rounded-full bg-slate-900 px-1.5 text-xs text-white"
                aria-label={`Remove photo ${i + 1}`}
              >
                ×
              </button>
            </div>
          ))}
          {attachedDocs.map((d, i) => (
            <span key={d.name + i} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
              {d.name}
              <button
                type="button"
                onClick={() => setAttachedDocs((prev) => prev.filter((_, j) => j !== i))}
                className="px-1 text-slate-500"
                aria-label={`Remove ${d.name}`}
              >
                ×
              </button>
            </span>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-500 sm:min-h-0">
              + Add photo or file
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                className="hidden"
                onChange={(e) => {
                  addAttachments(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <span className="text-xs text-slate-400">Optional: photos, a PDF or a Word file of the question, worksheet or project brief.</span>
        </div>
        <button
          type="submit"
          disabled={loading || noBookSelected}
          className="min-h-11 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:min-h-0 sm:w-auto"
        >
          {loading ? "Generating..." : "Generate"}
        </button>
        {loading && (
          <p role="status" className="text-xs text-slate-500">
            Reading your books and writing the answer. A whole worksheet or paper can take a minute or two; keep this
            page open.
          </p>
        )}
      </form>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{error}</p>}

      {result && (
        <>
          <AnswerView answer={result} />
          {result.id && (
            <p className="text-xs text-slate-500 print:hidden">
              Saved in{" "}
              <Link href={`/dashboard/documents/${result.id}`} className="underline">
                My Documents
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}

function QuotaBar({ used, quota }: { used: number; quota: number }) {
  const pct = quota > 0 ? Math.min((used / quota) * 100, 100) : 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Monthly token usage</span>
        <span>
          {used.toLocaleString()} / {quota.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-slate-900"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
