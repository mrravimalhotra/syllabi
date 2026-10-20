"use client";

import { useState } from "react";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

/** Asking for the scan-quality score of a book read before scores were kept, then reloading the list. */
export function useScanCheck(reload: () => Promise<void>) {
  const [checking, setChecking] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function check(id: string) {
    setChecking((c) => [...c, id]);
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)));
    try {
      const res = await fetch(`/api/library/${id}/scan`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't check this book. Try again in a moment.");
      }
      await reload();
    } catch (err) {
      const message = err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't check this book.";
      setErrors((e) => ({ ...e, [id]: message }));
    } finally {
      setChecking((c) => c.filter((x) => x !== id));
    }
  }

  return { checking, errors, check };
}
