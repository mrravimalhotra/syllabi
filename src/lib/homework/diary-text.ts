import { isNothing, type DiaryDay } from "@/lib/homework/diary";

// Most school diaries sent as PDFs are typed into a template, so the PDF carries the text itself, line by line:
// "Subject Math", "Topic Profit and Loss", "CW 3ABCD", "Reinforcement 3ABCD", "Submission date 26-10-2026",
// with the date and weekday under "Additional Information". That text is read here by code: exact, instant, and
// no AI used. Anything that doesn't look like the template (photos, handwriting, another layout) is left to the AI.

type Field = "subject" | "topic" | "subTopic" | "classwork" | "reinforcement" | "submission";

/** Each line's label, and the field its value goes in ("Sub Topic" before "Topic"). */
const LABELS: [RegExp, Field][] = [
  [/^sub\s*-?\s*topic\b[\s:.-]*/i, "subTopic"],
  [/^subject\b[\s:.-]*/i, "subject"],
  [/^topic\b[\s:.-]*/i, "topic"],
  [/^(?:cw|class\s*work)\b[\s:.-]*/i, "classwork"],
  [/^(?:reinforcement|hw|home\s*work)\b[\s:.-]*/i, "reinforcement"],
  [/^submission(?:\s*date)?\b[\s:.-]*/i, "submission"],
];
const PERIOD = /^period\s*[-–:.]?\s*\d{1,2}$/i;
const FOOTER = /^additional\s+info(?:rmation)?\b/i;
const DATE = /\d{1,2}\s*[-./]+\s*\d{1,2}\s*[-./]+\s*\d{2,4}/;
const WEEKDAY = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/** What is left of a line once its date, weekday, class ("7F", "Grade7") and stray marks are taken out. */
const leftover = (line: string) =>
  line
    .replace(new RegExp(DATE.source, "g"), " ")
    .replace(new RegExp(WEEKDAY.source, "gi"), " ")
    .replace(/\b(?:grade|class|std)\s*-?\s*\d{1,2}\s*[a-h]?\b|\b\d{1,2}\s*[a-h]\b/gi, " ")
    .replace(/^\s*additional\s+info(?:rmation)?\s*[:-]?/i, " ")
    .replace(/[\s=:_.,|*-]+/g, " ")
    .trim();

/**
 * The lines outside the periods: the header (the date, weekday and class) and the notices written under
 * "Additional Information", one per line. A line starting in lower case after one with no full stop carries it
 * on (a sentence wrapped onto the next line); numbers and bullets at the start are dropped.
 */
function splitFooter(lines: string[]): { header: string[]; notes: string[] } {
  const header: string[] = [];
  const notes: string[] = [];
  let open = false;
  for (const line of lines) {
    if (!leftover(line)) {
      header.push(line);
      open = false;
      continue;
    }
    const text = line.replace(/^\s*additional\s+info(?:rmation)?\s*[:-]?\s*/i, "").trim();
    if (!text || isNothing(text)) continue;
    // A sentence wrapped onto the next line carries on in lower case ("…for the" / "sports day.").
    const carriesOn = /^[a-z]/.test(text) && !/^\(?[a-z]\)\s/.test(text);
    if (open && carriesOn && notes.length && !/[.!?]$/.test(notes[notes.length - 1])) notes[notes.length - 1] += ` ${text}`;
    else notes.push(text);
    open = true;
  }
  return { header, notes: notes.map((n) => n.replace(/^(?:\d{1,2}[.)]|[-•*●▪])\s+/, "").trim()).filter((n) => n && !isNothing(n)).slice(0, 10) };
}

/** One diary page's own text as a diary day, or null when it isn't the diary template. */
export function diaryFromText(text: string): DiaryDay | null {
  const periods: Partial<Record<Field, string>>[] = [];
  const outside: string[] = [];
  const footerLines: string[] = [];
  let current: Partial<Record<Field, string>> | null = null;
  let last: Field | null = null;
  let footer = false;
  for (const line of text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    if (FOOTER.test(line)) footer = true;
    if (footer) {
      footerLines.push(line);
      continue;
    }
    if (PERIOD.test(line)) {
      last = null;
      continue;
    }
    const label = LABELS.find(([re]) => re.test(line));
    if (label) {
      const [re, field] = label;
      if (field === "subject" || !current) periods.push((current = {}));
      current[field] = line.replace(re, "").trim();
      last = field;
    } else if (current && last) {
      // A value that ran onto the next line.
      current[last] = `${current[last] ?? ""} ${line}`.trim();
    } else {
      outside.push(line);
    }
  }
  // The template: every period has its subject, and nearly all have the CW and Reinforcement rows.
  const complete = periods.filter((p) => p.subject !== undefined && p.classwork !== undefined && p.reinforcement !== undefined);
  if (periods.length < 2 || complete.length < periods.length * 0.8) return null;
  // Notices only from under "Additional Information" (a school's name at the top is not one); the date from the header lines.
  const { header, notes } = splitFooter(footerLines);
  const rest = [...outside, ...header].join("\n") || footerLines.join("\n");
  return {
    headerDate: DATE.exec(rest)?.[0],
    weekday: WEEKDAY.exec(rest)?.[1],
    notes,
    periods: periods.map((p) => ({
      subject: p.subject ?? "",
      topic: p.topic,
      subTopic: p.subTopic,
      classwork: p.classwork,
      reinforcement: p.reinforcement,
      submission: p.submission,
    })),
  };
}

/** Every page as diary days when each one is the typed template, else null (the pages go to the AI). */
export function diaryFromPages(pages: { text?: string }[]): DiaryDay[] | null {
  const days = pages.map((p) => (p.text ? diaryFromText(p.text) : null));
  return days.length > 0 && days.every((d) => d !== null) ? (days as DiaryDay[]) : null;
}
