"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { downscaleImageFile, type DownscaledImage } from "@/lib/downscale-image";
import { Markdown } from "@/components/Markdown";
import type { GenerationTaskType, Student } from "@/types/database";

const MAX_PHOTOS = 3;

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

interface GenerationResult {
  title: string;
  text: string;
  usedSearchGrounding: boolean;
  downloadUrl: string;
  sources: {
    id: string;
    section_label: string | null;
    source_type: string;
    page_number: number | null;
    imageUrl?: string;
  }[];
}

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  // Photos attached to the question (e.g. a homework page), downscaled in the
  // browser so they fit the request size limit.
  const [photos, setPhotos] = useState<DownscaledImage[]>([]);

  // The user's own books; answers search only the ones ticked (all by default).
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<string[] | null>(null);

  async function loadMe() {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (res.ok) setMe(data);
  }

  async function loadBooks() {
    const res = await fetch("/api/library");
    const data = await res.json();
    if (res.ok) setBooks((data.documents as Book[]).filter((b) => b.status === "ready"));
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

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const picked = Array.from(files).slice(0, room);
      const scaled = await Promise.all(picked.map(downscaleImageFile));
      setPhotos((prev) => [...prev, ...scaled].slice(0, MAX_PHOTOS));
      if (files.length > room) setError(`You can attach up to ${MAX_PHOTOS} photos.`);
    } catch {
      setError("Couldn't read that photo. Try a JPEG or PNG.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() && photos.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(ROUTE_BY_TASK[tab], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          documentIds: activeBookIds,
          photos: photos.map((p) => ({ data: p.imageBase64, mimeType: p.mimeType })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setResult(data);
      setPhotos([]);
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

      {me && books.length === 0 && (
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
            className={`rounded-md px-2 py-2 text-sm font-medium transition sm:flex-1 sm:px-3 ${
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
          {photos.length < MAX_PHOTOS && (
            <label className="cursor-pointer rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-500">
              + Add photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <span className="text-xs text-slate-400">Optional: a photo of the question or page (up to {MAX_PHOTOS}).</span>
        </div>
        <button
          type="submit"
          disabled={loading || noBookSelected}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{error}</p>}

      {result && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 print:border-0 print:p-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="w-full text-base font-semibold text-slate-900 sm:w-auto sm:min-w-0 sm:flex-1">{result.title}</h2>
            <div className="flex shrink-0 gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Print
              </button>
              <a
                href={result.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
              >
                Download PDF
              </a>
            </div>
          </div>
          {result.usedSearchGrounding && (
            <p className="text-xs text-slate-500">
              The knowledge base didn&apos;t fully cover this — supplemented with a web search.
            </p>
          )}
          <p className="text-xs text-slate-500">
            AI-generated. Check it before using it with your child or student.
          </p>
          <Markdown text={result.text} />
          {result.sources.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-500">Sources</p>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                {result.sources.map((s, i) => (
                  <li key={s.id}>
                    [{i + 1}] {s.section_label ?? s.source_type}
                    {s.page_number ? `, p.${s.page_number}` : ""}
                  </li>
                ))}
              </ul>
              <SourceImages sources={result.sources} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceImages({ sources }: { sources: GenerationResult["sources"] }) {
  const uniqueUrls = [...new Set(sources.map((s) => s.imageUrl).filter((u): u is string => Boolean(u)))];
  if (uniqueUrls.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {uniqueUrls.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not worth Next/Image's remote-pattern config
        <img key={url} src={url} alt="Referenced page" className="h-24 w-auto rounded-md border border-slate-200" />
      ))}
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
