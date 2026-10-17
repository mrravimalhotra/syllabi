"use client";

import { useState } from "react";
import { PencilIcon } from "@/components/icons";
import { Spinner, cx, input } from "@/components/ui";

interface EditableNameProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
}

/** An inline-editable text label — click the pencil to rename, Enter to save, Escape to cancel. */
export function EditableName({ value, onSave, className }: EditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value);
    setError(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            aria-label="New name"
            maxLength={200}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            disabled={saving}
            className={cx(input, "w-64 max-w-full")}
          />
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Spinner className="h-3.5 w-3.5" /> : "Save"}
          </button>
          <button onClick={cancel} disabled={saving} className="min-h-9 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100">
            Cancel
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className={cx("group flex min-w-0 items-center gap-1", className)}>
      <span className="truncate">{value}</span>
      <button
        onClick={() => setEditing(true)}
        aria-label={`Rename ${value}`}
        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      >
        <PencilIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
