"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { EMPTY_REWARDS, dayOf, earn, parseRewards, type Rewards } from "@/lib/rewards";

// The account's star chart, copied on this device so it shows at once (and offline). New stars
// wait in PENDING until the server has added them; OWNER is the account the copy belongs to
// (none until the first sync, when this device's whole chart is added to the account's).
const KEY = "syllabi.rewards";
const PENDING = "syllabi.rewards.pending";
const OWNER = "syllabi.rewards.owner";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Rewards } | null = null;

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
}

function set(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the stars still show for this visit (see save).
  }
}

function read(): Rewards {
  const raw = get(KEY);
  if (!cache || (raw !== null && cache.raw !== raw)) cache = { raw, value: parseRewards(raw) };
  return cache.value;
}

function save(next: Rewards) {
  const raw = JSON.stringify(next);
  set(KEY, raw);
  cache = { raw, value: next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

let syncing: Promise<void> | null = null;

/** Sends this device's new stars to the account and takes back the account's chart. */
function sync(): Promise<void> {
  let again = false;
  syncing ??= (async () => {
    const owner = get(OWNER);
    const pendingAtSend = parseRewards(get(PENDING));
    // The first time, the whole chart on this device is added (waiting stars are already in it); after that, only what is waiting.
    const toAdd = owner ? pendingAtSend : read();
    const res = await fetch("/api/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...toAdd, owner }),
    }).catch(() => null);
    if (!res?.ok) return; // offline or signed out: the stars wait for the next sync
    const body = (await res.json().catch(() => null)) as ({ owner: string } & Rewards) | null;
    if (!body) return;
    // Stars earned while this request was out are still waiting: keep them on top of the account's chart. A chart
    // that belonged to another account is dropped, waiting stars included.
    const now = parseRewards(get(PENDING));
    const otherAccount = owner !== null && owner !== body.owner;
    const later = otherAccount
      ? EMPTY_REWARDS
      : { stars: Math.max(0, now.stars - pendingAtSend.stars), days: now.days.filter((d) => !pendingAtSend.days.includes(d)) };
    set(OWNER, body.owner);
    set(PENDING, later.stars || later.days.length ? JSON.stringify(later) : null);
    save(parseRewards(JSON.stringify({ stars: body.stars + later.stars, days: [...new Set([...body.days, ...later.days])].sort() })));
    again = later.stars > 0 || later.days.length > 0;
  })().finally(() => {
    syncing = null;
    if (again) void sync(); // stars finished while this sync was out
  });
  return syncing;
}

/** The child's stars, streak days and stickers, the same on every device of the account. */
export function useRewards(): Rewards {
  useEffect(() => {
    void sync();
  }, []);
  return useSyncExternalStore(subscribe, read, () => EMPTY_REWARDS);
}

/** Adds stars for something just finished; returns the stickers just earned. */
function addStars(stars: number): string[] {
  const today = dayOf(new Date());
  const { rewards, newStickers } = earn(read(), stars, today);
  save(rewards);
  const pending = earn(parseRewards(get(PENDING)), stars, today).rewards;
  set(PENDING, JSON.stringify(pending));
  void sync();
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
