"use client";

import { useState } from "react";
import { Field, Spinner, button, cx, input, link } from "@/components/ui";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

export interface BookLabels {
  subject: string | null;
  grade: string | null;
  chapter: string | null;
}

/** A book's class, subject and chapter, shown in a line and changed in a small form (they drive Solve's filters). */
export function EditBookDetails({ id, labels, onSave }: { id: string; labels: BookLabels; onSave: (labels: BookLabels) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ grade: "", subject: "", chapter: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setDraft({ grade: labels.grade ?? "", subject: labels.subject ?? "", chapter: labels.chapter ?? "" });
    setError(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ grade: draft.grade.trim() || null, subject: draft.subject.trim() || null, chapter: draft.chapter.trim() || null });
      setOpen(false);
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't save the details. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={start} className={cx(link, "text-xs")}>
        {labels.chapter ? "Edit class, subject and chapter" : "Add the chapter"}
      </button>
    );
  }
  const box = (key: keyof typeof draft, label: string, placeholder: string, max: number) => (
    <Field label={label} htmlFor={`${key}-${id}`}>
      <input
        id={`${key}-${id}`}
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        placeholder={placeholder}
        maxLength={max}
        className={input}
      />
    </Field>
  );
  return (
    <form onSubmit={save} className="space-y-2 rounded-xl border border-slate-200 p-3">
      {box("grade", "Class", "e.g. Class 7", 50)}
      {box("subject", "Subject", "e.g. Geography", 100)}
      {box("chapter", "Chapter", "e.g. Unit 2 Lithosphere", 150)}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={button.small}>
          {saving ? <Spinner className="h-3.5 w-3.5" /> : null} Save
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={saving} className={cx(link, "text-xs")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
