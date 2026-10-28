"use client";

import { useState } from "react";
import type { Entry } from "@/app/dashboard/homework/_parts/EntryRow";
import { localToday } from "@/app/dashboard/homework/_parts/useHomework";
import { PencilIcon } from "@/components/icons";
import { Alert, Spinner, button, cx, input } from "@/components/ui";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";
import { addDays } from "@/lib/homework/schedule";

type Kind = "homework" | "classwork" | "note";
const KINDS: { value: Kind; label: string }[] = [
  { value: "homework", label: "Homework" },
  { value: "classwork", label: "Classwork to finish" },
  { value: "note", label: "Notice" },
];

/** Tomorrow and the next school days (Monday to Friday) after it, as quick choices: "Tomorrow", "Fri 30", "Mon 2". */
function quickDays(today: string): { value: string; label: string }[] {
  const out = [{ value: addDays(today, 1), label: "Tomorrow" }];
  for (let i = 2; out.length < 5 && i < 10; i++) {
    const day = addDays(today, i);
    const d = new Date(`${day}T00:00:00`);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    out.push({ value: day, label: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }) });
  }
  return out;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cx(
        "min-h-10 rounded-full border px-3.5 text-sm font-medium transition",
        on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Typing in what never reached the diary: work set out loud in class or sent on the parents' group, or a notice.
 * What it is comes first (it decides what else is asked), then the work, then when, with the usual days one tap
 * away. No AI is used; it is added straight away, given today.
 */
export function TypeIt({ subjects, onAdded }: { subjects: string[]; onAdded: (e: Entry) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: "homework" as Kind, subject: "", title: "", due_date: "" });
  const [pickDate, setPickDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days] = useState(() => quickDays(localToday()));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const note = form.kind === "note";

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
      setPickDate(false);
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
    <form onSubmit={(e) => void save(e)} className="basis-full space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Type in work">
      <p className="text-sm text-slate-600">For work set out loud in class or sent on the parents&apos; group, which isn&apos;t in the diary.</p>
      <div role="radiogroup" aria-label="What is it?" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Chip key={k.value} on={form.kind === k.value} onClick={() => set("kind", k.value)}>
            {k.label}
          </Chip>
        ))}
      </div>
      {!note && (
        <label className="block space-y-1 text-sm font-medium text-slate-700">
          Subject
          <input className={input} list="homework-subjects" value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Mathematics" required maxLength={80} />
          <datalist id="homework-subjects">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      )}
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        {note ? "The notice" : "The work, as the teacher gave it"}
        <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={note ? "Bring chart paper" : "Ex 4B, Q1 to 5"} required maxLength={500} />
      </label>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-slate-700">
          {note ? "For" : "Due"} <span className="font-normal text-slate-500">(if the teacher said)</span>
        </p>
        <div role="radiogroup" aria-label={note ? "For" : "Due"} className="flex flex-wrap gap-2">
          <Chip on={!form.due_date && !pickDate} onClick={() => (set("due_date", ""), setPickDate(false))}>
            No date
          </Chip>
          {days.map((d) => (
            <Chip key={d.value} on={!pickDate && form.due_date === d.value} onClick={() => (set("due_date", d.value), setPickDate(false))}>
              {d.label}
            </Chip>
          ))}
          <Chip on={pickDate} onClick={() => setPickDate(true)}>
            Other date
          </Chip>
        </div>
        {pickDate && <input className={cx(input, "w-auto")} type="date" aria-label="Other date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />}
      </div>
      <div className="flex flex-wrap items-center gap-3">
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
