import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { renderGenerationPdf } from "@/lib/pdf/render";
import { withoutAnswerKey } from "@/lib/format";
import { KIND_LABELS, makeQuiz, normaliseSettings, settingsProblem, worksheetMarkdown } from "@/lib/practice/order";

/**
 * A printable worksheet for a practice quiz. The questions come from the
 * settings and seed, so they match the quiz on screen; nothing is stored and
 * no AI is used. ?answers=0 leaves out the answer key.
 */
export async function GET(request: Request) {
  const student = await getCurrentStudent();
  if (!student || !student.active) return NextResponse.json({ error: "Your session has ended. Please sign in again." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  let raw: unknown = null;
  try {
    raw = JSON.parse(params.get("settings") ?? "null");
  } catch {
    // Falls through to the defaults below.
  }
  const settings = normaliseSettings(raw);
  const seed = Number(params.get("seed"));
  const problem = settingsProblem(settings);
  if (problem || !Number.isInteger(seed)) return NextResponse.json({ error: problem ?? "Missing quiz number." }, { status: 400 });

  const markdown = worksheetMarkdown(settings, makeQuiz(settings, seed));
  const withAnswers = params.get("answers") !== "0";
  const title = `Put in order: ${KIND_LABELS[settings.kind].toLowerCase()}`;
  try {
    const pdf = await renderGenerationPdf({
      taskType: "sample_paper",
      title,
      studentName: student.full_name ?? student.email,
      content: withAnswers ? markdown : withoutAnswerKey(markdown),
      sources: [],
      sourceImages: new Map(),
      label: "Practice worksheet",
      footer: "Made by Syllabi. Answers worked out by code, not AI.",
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${title.replace(/[^\w\- ]+/g, "")} worksheet.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[practice worksheet]", err);
    return NextResponse.json({ error: "Couldn't make the worksheet. Please try again." }, { status: 500 });
  }
}
