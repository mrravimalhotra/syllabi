"use client";

import { useEffect, useState } from "react";
import { Alert, Skeleton, button, cx, input } from "@/components/ui";
import { BUG_STATUSES, STATUS_LABELS, type BugStatus } from "@/lib/bug-report";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

interface Detail {
  report: { id: string; number: number; status: BugStatus; resolution: string | null };
  markdown: string;
}

/** One ticket in full: everything captured, a Copy button to hand it to whoever fixes it, and its status and resolution note. */
export function ReportDetail({ id, onChanged }: { id: string; onChanged: (id: string, status: BugStatus) => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState<BugStatus>("open");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    fetch(`/api/bug-reports/${id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't load the report.");
        if (!current) return;
        setDetail(data);
        setStatus(data.report.status);
        setNote(data.report.resolution ?? "");
      })
      .catch((err) => current && setError(err instanceof TypeError ? OFFLINE_MESSAGE : err.message));
    return () => {
      current = false;
    };
  }, [id]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/bug-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolution: note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the change.");
      onChanged(id, status);
      setMessage("Saved.");
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't save the change.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.markdown);
      setMessage("Copied. Paste it to Claude to get it fixed.");
    } catch {
      setError("Couldn't copy. Select the text below and copy it yourself.");
    }
  }

  if (error && !detail) return <Alert tone="error">{error}</Alert>;
  if (!detail) return <Skeleton className="h-48 rounded-2xl" />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className={button.primary}>
          Copy ticket for Claude
        </button>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as BugStatus)} className={cx(input, "!w-auto")}>
          {BUG_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button type="button" onClick={save} disabled={saving} className={button.secondary}>
          Save status and note
        </button>
      </div>
      <label className="block text-xs font-medium text-slate-500">
        What was done (shown to nobody else; paste the summary from Claude here)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={5000} className={cx(input, "mt-1")} />
      </label>
      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <pre
        aria-label="Ticket"
        className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs break-words whitespace-pre-wrap text-slate-700"
      >
        {detail.markdown}
      </pre>
    </div>
  );
}
