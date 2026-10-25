"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { EMPTY_REWARDS, dayOf, earn, parseRewards, type Rewards } from "@/lib/rewards";

// Kept on this device only: nothing about the child's play leaves it.
const KEY = "syllabi.rewards";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Rewards } | null = null;

function read(): Rewards {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: the stars still show for this visit.
  }
  if (!cache || cache.raw !== raw) cache = { raw, value: parseRewards(raw) };
  return cache.value;
}

function save(next: Rewards) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    cache = { raw: JSON.stringify(next), value: next };
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The child's stars, streak days and stickers on this device. */
export function useRewards(): Rewards {
  return useSyncExternalStore(subscribe, read, () => EMPTY_REWARDS);
}

/** Adds stars for something just finished; returns the stickers just earned. */
function addStars(stars: number): string[] {
  const { rewards, newStickers } = earn(read(), stars, dayOf(new Date()));
  save(rewards);
  return newStickers;
}

/**
 * Adds the stars once when a results screen appears (not again when it
 * re-renders), and reports the stickers that earned.
 */
export function useEarnOnce(stars: number, onNewStickers: (stickers: string[]) => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    onNewStickers(addStars(stars));
  }, [stars, onNewStickers]);
}
