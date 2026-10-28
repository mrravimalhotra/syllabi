"use client";

import { useCallback, useEffect, useState } from "react";
import type { Entry } from "@/app/dashboard/homework/_parts/EntryRow";
import { addStars } from "@/components/rewards/useRewards";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

/** Today in the phone's own time, as YYYY-MM-DD. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The homework list for both screens: loading it, ticking work done (shown at once, put back if it couldn't
 * be saved; the first tick of a homework adds the child's star), and removing an entry.
 */
export function useHomework(onStar?: (stickers: string[]) => void) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/homework");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the homework list.");
      setEntries(data.entries as Entry[]);
      setError(null);
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't load the homework list.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function toggle(entry: Entry) {
    const done = !entry.done;
    const swap = (to: boolean) => setEntries((list) => list?.map((e) => (e.id === entry.id ? { ...e, done: to, done_at: to ? new Date().toISOString() : null } : e)) ?? null);
    swap(done);
    const res = await fetch(`/api/homework/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) }).catch(() => null);
    if (!res?.ok) {
      swap(!done);
      setError("Couldn't save that. Check your connection and try again.");
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { star?: boolean };
    if (data.star) onStar?.(addStars(1));
  }

  async function remove(entry: Entry) {
    if (!window.confirm(`Remove "${entry.title}" (${entry.subject})? Use this when it was read or typed wrongly.`)) return;
    const res = await fetch(`/api/homework/${entry.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setError("Couldn't remove that. Try again in a moment.");
    setEntries((list) => list?.filter((e) => e.id !== entry.id) ?? null);
  }

  const added = (entry: Entry) => setEntries((list) => [entry, ...(list ?? [])]);

  return { entries, error, setError, load, toggle, remove, added };
}
