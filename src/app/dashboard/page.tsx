"use client";

import { useEffect, useState } from "react";
import { downscaleImageFile, type DownscaledImage } from "@/lib/downscale-image";
import type { Grade, GenerationTaskType, School, Student, Subject } from "@/types/database";

const MAX_PHOTOS = 3;

interface MeResponse {
  student: Student;
  quota: { used: number; quota: number; remaining: number; overQuota: boolean };
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

  // Which school/grade/subject to generate for. Admins can pick any school; a
  // parent or tutor picks a grade and subject within their assigned school.
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [scopeSchoolId, setScopeSchoolId] = useState("");
  const [scopeGradeId, setScopeGradeId] = useState("");
  const [scopeSubjectId, setScopeSubjectId] = useState("");

  const isAdmin = me?.student.role === "admin";

  async function loadMe() {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (res.ok) setMe(data);

    if (res.ok) {
      const taxRes = await fetch("/api/taxonomy");
      const tax = await taxRes.json();
      if (taxRes.ok) {
        setSchools(tax.schools);
        setGrades(tax.grades);
        setSubjects(tax.subjects);
        setScopeSchoolId((prev) => prev || data.student.school_id || tax.schools[0]?.id || "");
        setScopeGradeId((prev) => prev || data.student.grade_id || "");
        setScopeSubjectId((prev) => prev || data.student.subject_ids[0] || "");
      }
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount is intentional here
    loadMe();
  }, []);

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
          schoolId: scopeSchoolId,
          gradeId: scopeGradeId,
          subjectId: scopeSubjectId,
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

  const profileIncomplete = me && !isAdmin && (!me.student.school_id || me.student.subject_ids.length === 0);
  const scopeIncomplete = !scopeSchoolId || !scopeGradeId || !scopeSubjectId;

  return (
    <div className="space-y-6">
      {me && (
        <QuotaBar used={me.quota.used} quota={me.quota.quota} />
      )}

      {profileIncomplete && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Your account has no school or subjects yet. Ask an admin to complete it before generating
          content.
        </p>
      )}

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        {!profileIncomplete && (
          <div className={`grid gap-3 border-b border-slate-100 pb-3 ${isAdmin ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <div className={isAdmin ? "" : "hidden"}>
              <label className="text-xs font-medium text-slate-500">School</label>
              <select
                value={scopeSchoolId}
                onChange={(e) => {
                  setScopeSchoolId(e.target.value);
                  setScopeGradeId("");
                  setScopeSubjectId("");
                }}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">Select</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Grade</label>
              <select
                value={scopeGradeId}
                onChange={(e) => setScopeGradeId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                disabled={!scopeSchoolId}
              >
                <option value="">Select</option>
                {grades.filter((g) => g.school_id === scopeSchoolId).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Subject</label>
              <select
                value={scopeSubjectId}
                onChange={(e) => setScopeSubjectId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                disabled={!scopeSchoolId}
              >
                <option value="">Select</option>
                {subjects.filter((s) => s.school_id === scopeSchoolId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={TABS.find((t) => t.value === tab)?.placeholder}
          rows={4}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
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
          disabled={loading || !!profileIncomplete || scopeIncomplete}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-sm font-semibold text-slate-900">{result.title}</h2>
            <a
              href={result.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              Download PDF
            </a>
          </div>
          {result.usedSearchGrounding && (
            <p className="text-xs text-slate-500">
              The knowledge base didn&apos;t fully cover this — supplemented with a web search.
            </p>
          )}
          <p className="text-xs text-slate-500">
            AI-generated. Check it before using it with your child or student.
          </p>
          <div className="whitespace-pre-wrap text-sm text-slate-700">{result.text}</div>
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
