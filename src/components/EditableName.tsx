"use client";

import { useState } from "react";

interface EditableNameProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            disabled={saving}
            className="rounded-md border border-slate-300 px-2 py-0.5 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "..." : "Save"}
          </button>
          <button onClick={cancel} disabled={saving} className="text-xs text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-1.5 ${className ?? ""}`}>
      <span>{value}</span>
      <button
        onClick={() => setEditing(true)}
        aria-label={`Rename ${value}`}
        className="p-1 text-slate-400 hover:text-slate-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
      >
        <PencilIcon />
      </button>
    </div>
  );
}
