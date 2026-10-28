// The quality test set's class diary photos: diary pages with known contents are drawn as pictures (no text
// layer, like a phone photo), read by the real AI the way an upload is, and scored by whether every entry
// comes out exactly as the diary says. Made-up diaries in the school's layout; no real diary is kept here.
import sharp from "sharp";
import { entriesFrom, type DiaryDay } from "@/lib/homework/diary";
import { readDiary } from "@/lib/homework/read-diary";

interface DiaryCase {
  id: string;
  fileName: string;
  day: DiaryDay;
  /** Drawn slightly turned and greyed, like a quick phone photo. */
  photo?: boolean;
}

const P = (subject: string, topic: string, subTopic: string, classwork: string, reinforcement: string, submission: string) => ({ subject, topic, subTopic, classwork, reinforcement, submission });

export const DIARY_CASES: DiaryCase[] = [
  {
    id: "diary-typed-page",
    fileName: "7F_26th_Oct.jpg",
    day: {
      headerDate: "26-10-2026",
      weekday: "Monday",
      periods: [
        P("Math", "Profit and Loss", "Discount", "4ABC", "4A to E", "29.10.26"),
        P("Computer", "Introduction to Krita", "Layers", "Practical", "Nil", "Nil"),
        P("English Literature", "The Blue Carbuncle", "Reading", "NA", "NA", "Nil"),
        P("Chemistry", "Air", "Carbon dioxide", "3", "3", "29-10-2026"),
        P("Geography 26th Oct", "Lithosphere", "Rocks", "CW 2B ,C", "Nil", "NA"),
      ],
    },
  },
  {
    id: "diary-photo-with-notice",
    fileName: "IMG_2041.jpg",
    photo: true,
    day: {
      headerDate: "27-10-2026",
      weekday: "Tuesday",
      periods: [
        P("Mathematics", "Simple interest", "Simple interest", "1ABC", "1ABC", "28-10-26"),
        P("Language", "Preposition", "Kinds of Prepositions", "2 A B C", "1 A B C", "30-10-2026"),
        P("French", "Unit 5", "Revision", "revision", "nil", "nil"),
        P("Enrichment program", "Revision", "Algebra", "Practice sums", "Additional practice Q8,12,13", "NA"),
      ],
      notes: ["Bring chart paper on Friday", "Unit test of Maths on 30-10-2026"],
    },
  },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The diary page as a picture: each period a block of labelled rows, then Additional Information. */
async function draw(c: DiaryCase): Promise<string> {
  const lines: [string, string][] = [];
  c.day.periods.forEach((p, i) => {
    if (i) lines.push([`Period - ${i + 1}`, ""]);
    lines.push(["Subject", p.subject], ["Topic", p.topic ?? ""], ["Sub Topic", p.subTopic ?? ""], ["CW", p.classwork ?? ""], ["Reinforcement", p.reinforcement ?? ""], ["Submission date", p.submission ?? ""]);
  });
  lines.push(["Additional Information", ""], ...(c.day.notes ?? []).map((n): [string, string] => ["", n]), [`${c.day.headerDate}  7F`, ""], [c.day.weekday ?? "", ""]);
  const height = 60 + lines.length * 34;
  const rows = lines
    .map(([label, value], i) => `<text x="40" y="${60 + i * 34}" font-weight="bold">${esc(label)}</text><text x="330" y="${60 + i * 34}">${esc(value)}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}"><rect width="100%" height="100%" fill="#fff"/><g font-family="DejaVu Sans, sans-serif" font-size="22" fill="#111">${rows}</g></svg>`;
  let image = sharp(Buffer.from(svg));
  if (c.photo) image = sharp(await image.png().toBuffer()).rotate(2, { background: "#eceae4" }).modulate({ brightness: 0.92 }).blur(0.6);
  return (await image.jpeg({ quality: 82 }).toBuffer()).toString("base64");
}

const key = (e: { subject: string; kind: string; title: string; due_date: string | null }) => `${e.subject}|${e.kind}|${e.title}|${e.due_date ?? "none"}`;

/** Reads one diary picture with the AI and compares its entries with the diary's own. */
export async function runDiaryCase(c: DiaryCase): Promise<{ id: string; score: number; pass: boolean; notes: string; tokens: number }> {
  try {
    const data = await draw(c);
    const uploaded = "2026-10-28";
    const want = new Set(entriesFrom([c.day], c.fileName, uploaded).map(key));
    const { days, result } = await readDiary([{ data, mimeType: "image/jpeg" }], c.fileName);
    const got = new Set(entriesFrom(days, c.fileName, uploaded).map(key));
    const missed = [...want].filter((k) => !got.has(k));
    const extra = [...got].filter((k) => !want.has(k));
    const right = want.size - missed.length;
    const score = Math.round((right / Math.max(1, want.size + extra.length)) * 100);
    const notes = [missed.length ? `missed or misread: ${missed.join("; ")}` : "", extra.length ? `read wrongly: ${extra.join("; ")}` : ""].filter(Boolean).join(" · ");
    return { id: c.id, score, pass: missed.length === 0 && extra.length === 0, notes: notes || "fine", tokens: result.usage.totalTokens };
  } catch (err) {
    return { id: c.id, score: 0, pass: false, notes: `failed: ${err instanceof Error ? err.message : String(err)}`, tokens: 0 };
  }
}
