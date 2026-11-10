// The same diary day added twice (a weekly PDF and a daily photo, or the same page photographed again) reads a
// little differently each time: another date, "2A - 2F" for "2A-2F", a letter misread. An entry is the same work
// when its subject, kind and words match once spaces, punctuation and capitals are ignored. Entries are compared
// only with ones already in the list (earlier uploads), never with each other, and day by day: a new diary day is
// set against the day already there with the same date, or else a day of another date that is the same page: most
// of both days' entries are the same work with the same topic and sub-topic (work alone is not enough: "Drawing",
// "Practical" and "NB Work" come back day after day).
//   - the same work in that day: a clear repeat, not added again;
//   - left over on both sides, the same subject and kind and nearly the same words (or the same topic, when the day
//     is clearly a repeat): a possible duplicate, added and marked for the grown-up to merge or keep.

import type { NewEntry } from "@/lib/homework/diary";

export interface KnownEntry {
  id: string;
  kind: string;
  subject: string;
  title: string;
  topic: string | null;
  sub_topic: string | null;
  given_date: string;
}

/** Entries a day must share with a day of another date to be the same diary page, and the share of each day. */
const SAME_DAY_MIN = 3;
const SAME_DAY_SHARE = 0.6;

/** Letters and digits only, lower case: "2A - 2F" and "2a-2f" are the same words. */
const loose = (text: string | null | undefined) => (text ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const workKey = (e: { subject: string; kind: string; title: string }) => `${loose(e.subject)}|${e.kind}|${loose(e.title)}`;
type Topical = { subject: string; kind: string; title: string; topic: string | null; sub_topic: string | null };
const lineKey = (e: Topical) => `${workKey(e)}|${loose(e.topic)}|${loose(e.sub_topic)}`;

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** Nearly the same words: one inside the other, or a letter or two apart in longer text. */
function similarWords(a: string, b: string): boolean {
  const [x, y] = [loose(a), loose(b)];
  const shorter = Math.min(x.length, y.length);
  if (shorter < 3) return false;
  if (x.includes(y) || y.includes(x)) return true;
  return shorter >= 5 && editDistance(x, y) <= (shorter >= 10 ? 2 : 1);
}

const sameTopic = (a: { topic: string | null; sub_topic: string | null }, b: { topic: string | null; sub_topic: string | null }) =>
  loose(a.topic) !== "" && loose(a.topic) === loose(b.topic) && loose(a.sub_topic) === loose(b.sub_topic);

function byDay<T extends { given_date: string }>(entries: T[]): Map<string, T[]> {
  const days = new Map<string, T[]>();
  for (const e of entries) days.set(e.given_date, [...(days.get(e.given_date) ?? []), e]);
  return days;
}

/** The day already in the list a new day repeats: the same date, or another date most of its entries are in. */
function repeatedDay(fresh: NewEntry[], date: string, known: Map<string, KnownEntry[]>): { entries: KnownEntry[]; sure: boolean } | null {
  let best: { entries: KnownEntry[]; shared: number } | null = null;
  const keys = new Set(fresh.map(lineKey));
  for (const [day, entries] of known) {
    if (day === date) continue;
    const shared = entries.filter((e) => keys.has(lineKey(e))).length;
    if (shared >= SAME_DAY_MIN && shared >= SAME_DAY_SHARE * Math.max(keys.size, entries.length) && shared > (best?.shared ?? 0)) best = { entries, shared };
  }
  if (best) return { entries: best.entries, sure: true };
  const sameDate = known.get(date);
  return sameDate ? { entries: sameDate, sure: false } : null;
}

/**
 * New diary entries set against the list: `add` are the ones to add (a possible duplicate carries the id of the
 * entry it resembles in `duplicate_of`), `repeats` how many were clear repeats and left out.
 */
export function withoutRepeats(fresh: NewEntry[], existing: KnownEntry[]): { add: (NewEntry & { duplicate_of?: string })[]; repeats: number } {
  const known = byDay(existing);
  const add: (NewEntry & { duplicate_of?: string })[] = [];
  let repeats = 0;
  for (const [date, entries] of byDay(fresh)) {
    const day = repeatedDay(entries, date, known);
    if (!day) {
      add.push(...entries);
      continue;
    }
    const there = new Map(day.entries.map((e) => [workKey(e), e]));
    const left = entries.filter((e) => !there.has(workKey(e)));
    repeats += entries.length - left.length;
    // What is left on both sides is paired off, each known entry at most once.
    const freshKeys = new Set(entries.map(workKey));
    const unpaired = day.entries.filter((e) => !freshKeys.has(workKey(e)));
    for (const e of left) {
      const at = unpaired.findIndex((k) => loose(k.subject) === loose(e.subject) && k.kind === e.kind && (similarWords(k.title, e.title) || (day.sure && sameTopic(k, e))));
      add.push(at === -1 ? e : { ...e, duplicate_of: unpaired.splice(at, 1)[0].id });
    }
  }
  return { add, repeats };
}
