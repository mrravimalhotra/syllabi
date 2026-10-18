"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// A small saved choice per device (in the browser's storage), shared between
// components, safe when storage is blocked, and the same on server and first render.
const listeners = new Set<() => void>();
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function usePref<T>(key: string, fallback: T, valid: (value: unknown) => value is T): [T, (next: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = useMemo(() => {
    if (raw === null) return fallback;
    try {
      const parsed: unknown = JSON.parse(raw);
      return valid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
    // `fallback` and `valid` are constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not saved; the screen still shows the new choice until it is reloaded.
      }
      listeners.forEach((l) => l());
    },
    [key]
  );
  return [value, set];
}
