// The class diary turned into homework and classwork entries. The AI reads each page into raw fields
// (lib/homework/read-diary.ts); everything here is plain code, so the diary's quirks are handled the same
// way every time: wrong header dates, subject names with dates in them, many date formats, Nil/NA, repeats.

export type EntryKind = "classwork" | "homework" | "note";

/** One period as read from the diary, word for word. */
interface DiaryPeriod {
  subject: string;
  topic?: string;
  subTopic?: string;
  /** The CW column: becomes a classwork entry. */
  classwork?: string;
  /** The Reinforcement column: becomes a homework entry. */
  reinforcement?: string;
  /** The submission date as written ("26-10-2026", "29.10.26", "21st Oct"...). */
  submission?: string;
}

/** One diary day as read from the page. */
export interface DiaryDay {
  /** The date in the page's header, as written (it can be wrong). */
  headerDate?: string;
  /** The weekday the page gives ("Monday"), which is usually right. */
  weekday?: string;
  periods: DiaryPeriod[];
  /** Notices under "Additional Information" (bring chart paper, a test date), one per item, word for word. */
  notes?: string[];
}

export interface NewEntry {
  kind: EntryKind;
  subject: string;
  title: string;
  topic: string | null;
  sub_topic: string | null;
  due_date: string | null;
  given_date: string;
  dedup_key: string;
  /** The two readings of a diary photo didn't agree on it: worth checking against the page. */
  needs_check?: boolean;
}

/**
 * Two readings of the same diary photo put together: what both found is kept as it is; what only one found,
 * or what they dated differently, is kept too (better a line to check than a missed homework) and marked.
 */
export function compareReads(first: NewEntry[], second: NewEntry[]): NewEntry[] {
  const other = new Map(second.map((e) => [e.dedup_key, e]));
  const out = first.map((e) => {
    const twin = other.get(e.dedup_key);
    return { ...e, needs_check: !twin || twin.due_date !== e.due_date };
  });
  const seen = new Set(first.map((e) => e.dedup_key));
  return [...out, ...second.filter((e) => !seen.has(e.dedup_key)).map((e) => ({ ...e, needs_check: true }))];
}

/** Today's date in India, where the diaries are written, as YYYY-MM-DD. */
export function indiaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const valid = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/** A year for a day and month with no year: the one that puts it closest to the reference date. */
function nearestYear(m: number, d: number, reference: string): number {
  const ref = Date.parse(reference);
  const year = Number(reference.slice(0, 4));
  return [year - 1, year, year + 1].reduce((best, y) =>
    Math.abs(Date.UTC(y, m - 1, d) - ref) < Math.abs(Date.UTC(best, m - 1, d) - ref) ? y : best
  );
}

/**
 * A date written in any of the diary's ways, as YYYY-MM-DD: "26-10-2026", "29.10.26", "28-10-26", "27/10/2026",
 * "2026-10-27", "21st Oct", "Oct 21", "27 October 2026". A missing year is taken from the reference date
 * (the nearest one). Null when there is no date in it.
 */
export function parseDiaryDate(raw: string | undefined, reference: string): string | null {
  const text = (raw ?? "").toLowerCase().trim();
  if (!text) return null;
  let m = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(text);
  if (m && valid(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
  m = /(\d{1,2})[-./](\d{1,2})(?:[-./](\d{2,4}))?/.exec(text);
  if (m) {
    const [d, mo] = [+m[1], +m[2]];
    const y = m[3] ? fullYear(m[3]) : nearestYear(mo, d, reference);
    if (valid(y, mo, d)) return iso(y, mo, d);
  }
  const month = (word: string) => MONTHS.indexOf(word.slice(0, 3)) + 1;
  m = /(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]{3,9})\.?,?(?:\s+(\d{2,4}))?/.exec(text);
  if (m && month(m[2]) > 0) {
    const [d, mo] = [+m[1], month(m[2])];
    const y = m[3] ? fullYear(m[3]) : nearestYear(mo, d, reference);
    if (valid(y, mo, d)) return iso(y, mo, d);
  }
  m = /([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?/.exec(text);
  if (m && month(m[1]) > 0) {
    const [d, mo] = [+m[2], month(m[1])];
    const y = m[3] ? fullYear(m[3]) : nearestYear(mo, d, reference);
    if (valid(y, mo, d)) return iso(y, mo, d);
  }
  return null;
}

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

const FULL_DATE = /\b\d{1,2}\s*[-./]+\s*\d{1,2}\s*[-./]+\s*\d{2,4}\b/;
const NAMED_DATE = /\b\d{1,2}(?:st|nd|rd|th)?\s*(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/i;

/**
 * The date a notice is for, from its own words: a full date ("30-10-2026"), a named one ("31st Oct"),
 * "tomorrow", or a weekday ("on Friday", the next one after the diary day). Bare numbers like "Ex 4.2" are
 * not dates. Null when it names none.
 */
function noteDate(text: string, given: string): string | null {
  const exact = FULL_DATE.exec(text) ?? NAMED_DATE.exec(text);
  if (exact) return parseDiaryDate(exact[0], given);
  const t = new Date(`${given}T00:00:00Z`);
  if (/\btomorrow\b/i.test(text)) {
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  }
  const day = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
  if (day === -1) return null;
  t.setUTCDate(t.getUTCDate() + (((day - t.getUTCDay() + 6) % 7) + 1));
  return t.toISOString().slice(0, 10);
}

/**
 * The diary day's date. Header dates can be wrong (the 27 Oct page said 27-09-2026), so the file name wins
 * when it has a date; otherwise the header date is used if its weekday agrees with the page's weekday, else
 * the same day of a nearby month whose weekday does agree; and the upload date when nothing else is known.
 */
export function givenDate(day: DiaryDay, fileName: string, uploaded: string): string {
  const fromFile = parseDiaryDate(fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_]/g, " "), uploaded);
  if (fromFile) return fromFile;
  const header = parseDiaryDate(day.headerDate, uploaded);
  const weekday = WEEKDAYS.findIndex((w) => (day.weekday ?? "").toLowerCase().startsWith(w.slice(0, 3)));
  if (!header) return uploaded;
  if (weekday === -1 || weekdayOf(header) === weekday) return header;
  // The header's day number with a slipped month: the nearest month (to the upload) that has the right weekday.
  const d = Number(header.slice(8, 10));
  const ref = Date.parse(uploaded);
  const candidates: string[] = [];
  for (let offset = -3; offset <= 3; offset++) {
    const t = new Date(ref);
    t.setUTCDate(1);
    t.setUTCMonth(t.getUTCMonth() + offset);
    const [y, mo] = [t.getUTCFullYear(), t.getUTCMonth() + 1];
    if (valid(y, mo, d) && weekdayOf(iso(y, mo, d)) === weekday) candidates.push(iso(y, mo, d));
  }
  candidates.sort((a, b) => Math.abs(Date.parse(a) - ref) - Math.abs(Date.parse(b) - ref));
  return candidates[0] ?? header;
}

/** Ways the diary writes a subject, and the name it is kept under. */
const SUBJECT_NAMES: Record<string, string> = {
  language: "English Language",
  "english lang": "English Language",
  "eng language": "English Language",
  "eng lang": "English Language",
  maths: "Mathematics",
  math: "Mathematics",
  "comp sc": "Computer Science",
  computer: "Computer Science",
  computers: "Computer Science",
  evs: "EVS",
  "social science": "Social Science",
  sst: "Social Science",
};

/** Short subject names kept in capitals. */
const ACRONYMS = new Set(["EVS", "SST", "ICT", "SPA", "GK", "PE", "IT", "SUPW", "STEM", "AI"]);

/** A subject's name without the date some entries carry ("Geography 22nd oct", "History 19/10/26"), in one spelling. */
export function normaliseSubject(raw: string): string {
  const cleaned = raw
    .replace(/\s*[-–(,:]?\s*\d{1,2}(?:st|nd|rd|th)?[\s./-]*(?:[a-z]{3,9}\.?|\d{1,2})(?:[\s./-]*\d{2,4})?\s*\)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const key = cleaned.toLowerCase().replace(/\.$/, "");
  if (SUBJECT_NAMES[key]) return SUBJECT_NAMES[key];
  // One spelling whatever the case it was typed in ("ART", "Art", "FRENCH"), keeping short names like EVS and SPA.
  return cleaned
    .split(" ")
    .map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Nothing set: blank, "Nil", "NA", "N/A", "None" or a dash. */
export function isNothing(text: string | undefined): boolean {
  return /^\s*(nil|na|n\.?\/?a\.?|none|-+|—|–|\.)?\s*$/i.test(text ?? "");
}

/** The key that keeps one entry once: the same day, subject, kind and words. */
export function dedupKey(e: Pick<NewEntry, "given_date" | "subject" | "kind" | "title">): string {
  const words = e.title.toLowerCase().replace(/\s+/g, " ").trim();
  return `${e.given_date}|${e.subject.toLowerCase()}|${e.kind}|${words}`;
}

const clean = (text: string | undefined, max: number) => (isNothing(text) ? null : (text ?? "").replace(/\s+/g, " ").trim().slice(0, max));

/** Every classwork and homework entry of the diary days read from one upload, each once. */
export function entriesFrom(days: DiaryDay[], fileName: string, uploaded: string): NewEntry[] {
  const out = new Map<string, NewEntry>();
  const add = (entry: NewEntry) => {
    entry.dedup_key = dedupKey(entry);
    if (!out.has(entry.dedup_key)) out.set(entry.dedup_key, entry);
  };
  for (const day of days) {
    const given = givenDate(day, fileName, uploaded);
    for (const p of day.periods ?? []) {
      if (!p.subject || isNothing(p.subject)) continue;
      const subject = normaliseSubject(p.subject);
      const base = { subject, topic: clean(p.topic, 300), sub_topic: clean(p.subTopic, 300), given_date: given };
      const work: [EntryKind, string | undefined][] = [
        ["classwork", p.classwork],
        ["homework", p.reinforcement],
      ];
      for (const [kind, text] of work) {
        const title = clean(text, 500);
        if (title) add({ ...base, kind, title, due_date: parseDiaryDate(p.submission, given), dedup_key: "" });
      }
    }
    // A notice is due on the date it names, if it names one ("Unit test on 30-10-2026").
    for (const note of day.notes ?? []) {
      const title = clean(note, 500);
      if (title) add({ kind: "note", subject: "Notice", title, topic: null, sub_topic: null, given_date: given, due_date: noteDate(title, given), dedup_key: "" });
    }
  }
  return [...out.values()];
}
