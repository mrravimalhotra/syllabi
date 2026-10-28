// How the homework list is laid out: by when it is due (tonight's work first, the way a child plans an
// evening), or by subject. Plain code over YYYY-MM-DD dates, so it is the same on every device.

export interface Scheduled {
  kind: "classwork" | "homework" | "note";
  subject: string;
  title: string;
  due_date: string | null;
  given_date: string;
}

type Bucket = "notice" | "overdue" | "today" | "tomorrow" | "week" | "later" | "none" | "class";

const BUCKET_TITLES: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Due tomorrow",
  week: "Later this week",
  later: "Later",
  notice: "Notices from the diary",
  none: "No submission date: ask your teacher",
  class: "Classwork with no date: tick it once it's finished",
};

const ORDER: Bucket[] = ["notice", "overdue", "today", "tomorrow", "week", "later", "none", "class"];

/** The date `days` after a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** When a piece of open work is due, as seen today ("this week" runs to the coming Sunday). */
function bucketOf(entry: Scheduled, today: string): Bucket {
  const due = entry.due_date;
  // Classwork with no date was done in class; only homework with no date needs asking about.
  if (!due) return entry.kind === "note" ? "notice" : entry.kind === "classwork" ? "class" : "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  if (due === addDays(today, 1)) return "tomorrow";
  const toSunday = (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7;
  return due <= addDays(today, toSunday) ? "week" : "later";
}

/** Soonest due first (no date last), then the oldest given first: it has waited longest. */
function byUrgency(a: Scheduled, b: Scheduled): number {
  return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.given_date.localeCompare(b.given_date) || a.subject.localeCompare(b.subject);
}

/** Work under its due-date headings, in the order to do it; empty headings are left out. */
export function byDueDate<T extends Scheduled>(entries: T[], today: string): { title: string; entries: T[] }[] {
  return ORDER.map((b) => ({ title: BUCKET_TITLES[b], entries: entries.filter((e) => bucketOf(e, today) === b).sort(byUrgency) })).filter((g) => g.entries.length > 0);
}

/** Work under its subjects (A to Z), each in the order to do it. */
export function bySubject<T extends Scheduled>(entries: T[]): { title: string; entries: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const e of entries) groups.set(e.subject, [...(groups.get(e.subject) ?? []), e]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([title, list]) => ({ title, entries: [...list].sort(byUrgency) }));
}

const isSchoolDay = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
};

/**
 * The latest school day (Monday to Friday) whose diary has not been added (it has no entries, and wasn't added as a day with nothing set), or null. Today
 * counts only from the afternoon (`hour` 15 or later), once the diary is home. Only asked once the list is in use.
 */
export function missingDiaryDay(entries: Pick<Scheduled, "given_date">[], diaryDays: string[], today: string, hour: number): string | null {
  const given = new Set([...entries.map((e) => e.given_date), ...diaryDays]);
  if (given.size === 0) return null;
  let day = hour >= 15 ? today : addDays(today, -1);
  for (let i = 0; i < 7 && !isSchoolDay(day); i++) day = addDays(day, -1);
  if (!isSchoolDay(day) || given.has(day)) return null;
  // Older than every entry: the list wasn't in use yet.
  return [...given].some((g) => g < day) ? day : null;
}

/** What Ask Syllabi is asked when the child needs help with a piece of work. */
export function helpQuestion(entry: { subject: string; title: string; topic: string | null; sub_topic: string | null }): string {
  const about = [entry.topic, entry.sub_topic].filter(Boolean).join(", ");
  return `${entry.subject} homework${about ? ` (${about})` : ""}: ${entry.title}`;
}

const sameWords = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, "") === b.toLowerCase().replace(/\s+/g, "");

/**
 * The same work set as classwork and homework in one period ("CW 3ABCD", "Reinforcement 3ABCD") shown once:
 * the homework carries the classwork as its `twin`, and the classwork is left out. Everything else is unchanged.
 */
export function pairUp<T extends Scheduled & { id: string; title: string }>(entries: T[]): (T & { twin?: T })[] {
  const absorbed = new Set<string>();
  const out: (T & { twin?: T })[] = [];
  for (const e of entries) {
    if (e.kind !== "homework") continue;
    const twin = entries.find(
      (c) => c.kind === "classwork" && !absorbed.has(c.id) && c.given_date === e.given_date && c.subject === e.subject && sameWords(c.title, e.title)
    );
    if (twin) absorbed.add(twin.id);
    out.push(twin ? { ...e, twin } : e);
  }
  return entries.flatMap((e) => (e.kind === "homework" ? out.filter((o) => o.id === e.id) : absorbed.has(e.id) ? [] : [e]));
}
