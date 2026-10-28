"use client";

import { useState } from "react";
import type { Entry } from "@/app/dashboard/homework/_parts/EntryRow";
import { PencilIcon } from "@/components/icons";
import { Alert, Spinner, button, cx, input } from "@/components/ui";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

/**
 * Typing in work that never reached the diary: set out loud in class, or sent on the parents' group. No AI is
 * used; it is added straight away, given today.
 */
export function TypeIt({ subjects, onAdded }: { subjects: string[]; onAdded: (e: Entry) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", title: "", kind: "homework", due_date: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/homework/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't add that. Try again in a moment.");
      onAdded(data.entry as Entry);
      setForm((f) => ({ ...f, title: "", due_date: "" }));
      setOpen(false);
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" className={button.secondary} onClick={() => setOpen(true)}>
        <PencilIcon className="h-4 w-4" /> Type it in
      </button>
    );
  return (
    <form onSubmit={(e) => void save(e)} className="basis-full space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Type in work">
      <p className="text-sm text-slate-600">For work set out loud in class or sent on the parents&apos; group, which isn&apos;t in the diary.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Subject
          <input className={input} list="homework-subjects" value={form.subject} onChange={set("subject")} placeholder="Mathematics" required maxLength={80} />
          <datalist id="homework-subjects">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Submit by <span className="font-normal text-slate-500">(if the teacher said)</span>
          <input className={input} type="date" value={form.due_date} onChange={set("due_date")} />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        The work, as the teacher gave it
        <input className={input} value={form.title} onChange={set("title")} placeholder="Ex 4B, Q1 to 5" required maxLength={500} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select className={cx(input, "w-auto")} value={form.kind} onChange={set("kind")} aria-label="Kind">
          <option value="homework">Homework</option>
          <option value="classwork">Classwork to finish</option>
        </select>
        <button type="submit" className={button.primary} disabled={busy}>
          {busy && <Spinner />} Add
        </button>
        <button type="button" className={button.ghost} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}
