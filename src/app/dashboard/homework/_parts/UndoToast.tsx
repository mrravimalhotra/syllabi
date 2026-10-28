"use client";

/** "Done: 3ABCD · Undo", just above the phone's tab bar, for a few seconds after a tick. */
export function UndoToast({ row, onUndo }: { row: { title: string } | null; onUndo: () => void }) {
  if (!row) return null;
  return (
    <div role="status" className="fixed bottom-24 left-4 right-16 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg sm:inset-x-4 sm:bottom-6">
      <span className="min-w-0 truncate">✓ Done: {row.title}</span>
      <button type="button" onClick={onUndo} className="shrink-0 rounded-md px-2 py-1 font-semibold text-amber-300 hover:bg-white/10">
        Undo
      </button>
    </div>
  );
}
