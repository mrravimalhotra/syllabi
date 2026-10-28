"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry, Row } from "@/app/dashboard/homework/_parts/EntryRow";
import { addStars } from "@/components/rewards/useRewards";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

/** Today in the phone's own time, as YYYY-MM-DD. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** How long "Done · Undo" stays on screen. */
const UNDO_MS = 6000;

/**
 * The homework list for both screens: loading it, ticking work done (shown at once, put back if it couldn't
 * be saved; a row's classwork twin is ticked with it; the first tick of a homework adds the child's star; the
 * last tick can be undone for a few seconds), and removing an entry.
 */
export function useHomework(onStar?: (stickers: string[]) => void) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [diaryDays, setDiaryDays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<Row | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/homework");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the homework list.");
      setEntries(data.entries as Entry[]);
      setDiaryDays(Array.isArray(data.diaryDays) ? (data.diaryDays as string[]) : []);
      setError(null);
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't load the homework list.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const save = (id: string, done: boolean) =>
    fetch(`/api/homework/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) }).catch(() => null);

  async function toggle(row: Row) {
    const done = !row.done;
    const ids = [row.id, ...(row.twin ? [row.twin.id] : [])];
    const swap = (to: boolean) =>
      setEntries((list) => list?.map((e) => (ids.includes(e.id) ? { ...e, done: to, done_at: to ? new Date().toISOString() : null } : e)) ?? null);
    swap(done);
    if (timer.current) clearTimeout(timer.current);
    setJustDone(done ? row : null);
    if (done) timer.current = setTimeout(() => setJustDone(null), UNDO_MS);
    const [res, ...rest] = await Promise.all(ids.map((id) => save(id, done)));
    if (!res?.ok || rest.some((r) => !r?.ok)) {
      swap(!done);
      setJustDone(null);
      setError("Couldn't save that. Check your connection and try again.");
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { star?: boolean };
    if (data.star) onStar?.(addStars(1));
  }

  /** Puts the last ticked row back to not done. */
  function undo() {
    if (justDone) void toggle({ ...justDone, done: true });
  }

  async function remove(row: Row) {
    if (!window.confirm(`Remove "${row.title}" (${row.subject})? Use this when it was read or typed wrongly.`)) return;
    const ids = [row.id, ...(row.twin ? [row.twin.id] : [])];
    const results = await Promise.all(ids.map((id) => fetch(`/api/homework/${id}`, { method: "DELETE" }).catch(() => null)));
    if (results.some((r) => !r?.ok)) setError("Couldn't remove that. Try again in a moment.");
    setEntries((list) => list?.filter((e) => !ids.includes(e.id) || !results[ids.indexOf(e.id)]?.ok) ?? null);
  }

  const added = (entry: Entry) => setEntries((list) => [entry, ...(list ?? [])]);

  return { entries, diaryDays, error, load, toggle, undo, justDone, remove, added };
}
