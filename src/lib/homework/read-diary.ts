import { generateCompletion } from "@/lib/llm";
import type { CompletionImage, CompletionResult } from "@/lib/llm/types";
import type { DiaryDay } from "@/lib/homework/diary";

// The AI only reads the class diary into raw fields, word for word; lib/homework/diary.ts turns those into
// entries (dates, subject names, Nil/NA and repeats are handled in code, the same way every time).

export const DIARY_SYSTEM = `You read pages of a school class diary (printed, typed or handwritten; PDF pages or photos) and copy
what they say into JSON, exactly as written. Each diary day has a date in its header, often a weekday,
and up to 10 periods. Each period has: Subject, Topic, Sub Topic, CW (classwork), Reinforcement
(homework) and Submission date.

Rules:
- Copy every value word for word, in its own script (keep Devanagari as Devanagari), with its own
  spelling and abbreviations ("4A to E", "3ABCD", "pg 63,64 translation"). Do not correct, expand,
  translate or summarise anything.
- Copy dates exactly as written ("27-09-2026", "29.10.26", "21st Oct"); do not convert them.
- Copy "Nil", "NA", "-" and blanks as they are (an empty string for a blank cell). Do not invent values.
- One entry per period row, in order, even when two rows repeat the same subject or text.
- If a page holds several days, give each day separately.
Reply only with JSON:
{"days": [{"headerDate": "...", "weekday": "...", "periods": [{"subject": "...", "topic": "...", "subTopic": "...",
"classwork": "...", "reinforcement": "...", "submission": "..."}]}]}`;

const STRING = { type: "string" };
const SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          headerDate: STRING,
          weekday: STRING,
          periods: {
            type: "array",
            items: {
              type: "object",
              properties: { subject: STRING, topic: STRING, subTopic: STRING, classwork: STRING, reinforcement: STRING, submission: STRING },
              required: ["subject"],
            },
          },
        },
        required: ["periods"],
      },
    },
  },
  required: ["days"],
};

/** The diary days in a reply; null when it can't be read. */
export function parseDiary(text: string): DiaryDay[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as { days?: unknown };
    if (!Array.isArray(v.days)) return null;
    const str = (x: unknown) => (typeof x === "string" ? x : undefined);
    return v.days.slice(0, 31).map((d) => {
      const day = (d ?? {}) as Record<string, unknown>;
      const periods = Array.isArray(day.periods) ? day.periods : [];
      return {
        headerDate: str(day.headerDate),
        weekday: str(day.weekday),
        periods: periods.slice(0, 20).map((p) => {
          const r = (p ?? {}) as Record<string, unknown>;
          return {
            subject: str(r.subject) ?? "",
            topic: str(r.topic),
            subTopic: str(r.subTopic),
            classwork: str(r.classwork),
            reinforcement: str(r.reinforcement),
            submission: str(r.submission),
          };
        }),
      };
    });
  } catch {
    return null;
  }
}

/** Reads diary pages (pictures, with a PDF page's own text when it has one) into diary days. */
export async function readDiary(pages: CompletionImage[], fileName: string): Promise<{ days: DiaryDay[]; result: CompletionResult }> {
  const known = pages.map((p, i) => (p.text ? `Page ${i + 1} text (from the PDF itself):\n${p.text}` : "")).filter(Boolean);
  const result = await generateCompletion({
    taskType: "ad_hoc",
    systemInstructions: DIARY_SYSTEM,
    prompt: [`The file is named "${fileName}".`, ...known, "Copy the diary pages into JSON."].join("\n\n"),
    images: pages,
    temperature: 0,
    maxOutputTokens: 8192,
    jsonSchema: SCHEMA,
  });
  const days = parseDiary(result.text);
  if (!days) throw new Error("The diary could not be read: the reply was not in the expected form");
  return { days, result };
}
