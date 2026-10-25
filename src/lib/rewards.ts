// Stars, a daily streak and a sticker collection for the child's games and quizzes.
// Kept on the device (no account data): see useRewards.

export interface Rewards {
  /** Every star earned so far. */
  stars: number;
  /** The days something was finished, as YYYY-MM-DD in local time, oldest first (the last 60 are kept). */
  days: string[];
}

export const EMPTY_REWARDS: Rewards = { stars: 0, days: [] };

/** One sticker for every this many stars. */
export const STARS_PER_STICKER = 10;

/** The stickers, in the order they are earned. */
export const STICKERS = [
  "🦁",
  "🐼",
  "🦄",
  "🐬",
  "🦋",
  "🐢",
  "🦊",
  "🐧",
  "🐙",
  "🦖",
  "🐝",
  "🦉",
  "🐳",
  "🦒",
  "🐨",
  "🦜",
  "🌈",
  "🚀",
  "🏰",
  "🎈",
  "🐯",
  "🐸",
  "🦩",
  "🐞",
  "🌻",
  "⭐",
  "🍦",
  "🎨",
  "⚽",
  "🏆",
];

const KEEP_DAYS = 60;

/** Today's date as YYYY-MM-DD in local time. */
export function dayOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayBefore(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayOf(new Date(y, m - 1, d - 1));
}

/** The stickers earned with this many stars. */
export function stickersFor(stars: number): string[] {
  return STICKERS.slice(0, Math.min(STICKERS.length, Math.floor(stars / STARS_PER_STICKER)));
}

/** Stars still needed for the next sticker, or null when every sticker is earned. */
export function starsToNextSticker(stars: number): number | null {
  if (stickersFor(stars).length >= STICKERS.length) return null;
  return STARS_PER_STICKER - (stars % STARS_PER_STICKER);
}

/**
 * Days in a row with something finished, counting back from today, or from
 * yesterday when nothing is finished yet today (so the streak isn't lost
 * until a whole day is missed).
 */
export function streakOf(days: string[], today: string): number {
  const played = new Set(days);
  let day = played.has(today) ? today : dayBefore(today);
  let count = 0;
  while (played.has(day)) {
    count++;
    day = dayBefore(day);
  }
  return count;
}

/** Adds the stars from something just finished today; returns the new state and any stickers just earned. */
export function earn(rewards: Rewards, stars: number, today: string): { rewards: Rewards; newStickers: string[] } {
  const gained = Math.max(0, Math.floor(stars));
  const total = rewards.stars + gained;
  const days = rewards.days.includes(today) ? rewards.days : [...rewards.days, today].sort().slice(-KEEP_DAYS);
  const before = stickersFor(rewards.stars).length;
  return { rewards: { stars: total, days }, newStickers: stickersFor(total).slice(before) };
}

/** A saved state read back from storage, or the empty one if it isn't valid. */
export function parseRewards(raw: string | null): Rewards {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<Rewards> | null;
    if (!v || typeof v.stars !== "number" || !Number.isFinite(v.stars) || v.stars < 0 || !Array.isArray(v.days)) return EMPTY_REWARDS;
    const days = v.days.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-KEEP_DAYS);
    return { stars: Math.floor(v.stars), days };
  } catch {
    return EMPTY_REWARDS;
  }
}
