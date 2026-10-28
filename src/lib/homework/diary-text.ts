import type { DiaryDay } from "@/lib/homework/diary";

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

/** One diary page's own text as a diary day, or null when it isn't the diary template. */
export function diaryFromText(text: string): DiaryDay | null {
  const periods: Partial<Record<Field, string>>[] = [];
  const outside: string[] = [];
  let current: Partial<Record<Field, string>> | null = null;
  let last: Field | null = null;
  let footer = false;
  for (const line of text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    if (FOOTER.test(line)) footer = true;
    if (footer) {
      outside.push(line);
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
  const rest = outside.join("\n");
  return {
    headerDate: DATE.exec(rest)?.[0],
    weekday: WEEKDAY.exec(rest)?.[1],
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
