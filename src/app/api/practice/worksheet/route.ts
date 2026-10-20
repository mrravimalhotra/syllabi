import { NextResponse } from "next/server";
import { apiError, authenticate } from "@/lib/api";
import { renderGenerationPdf } from "@/lib/pdf/render";
import { withoutAnswerKey } from "@/lib/format";
import { KIND_LABELS, makeQuiz, normaliseSettings, settingsProblem, worksheetMarkdown } from "@/lib/practice/order";

/**
 * A printable worksheet for a practice quiz. The questions come from the
 * settings and seed, so they match the quiz on screen; nothing is stored and
 * no AI is used. ?answers=0 leaves out the answer key.
 */
export async function GET(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const student = auth.account;

  const params = new URL(request.url).searchParams;
  let raw: unknown = null;
  try {
    raw = JSON.parse(params.get("settings") ?? "null");
  } catch {
    // Falls through to the defaults below.
  }
  const settings = normaliseSettings(raw);
  const seedText = params.get("seed") ?? "";
  const seed = /^\d{1,10}$/.test(seedText) ? Number(seedText) : NaN;
  if (!Number.isSafeInteger(seed)) return apiError(400, "This worksheet link is incomplete. Go back to Practice and press Print again.");
  const problem = settingsProblem(settings);
  if (problem) return apiError(400, problem);

  const markdown = worksheetMarkdown(settings, makeQuiz(settings, seed));
  const withAnswers = params.get("answers") !== "0";
  const title = `Put in order: ${KIND_LABELS[settings.kind].toLowerCase()}`;
  try {
    const pdf = await renderGenerationPdf({
      taskType: "sample_paper",
      title,
      preparedBy: student.full_name ?? student.email,
      content: withAnswers ? markdown : withoutAnswerKey(markdown),
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
    return apiError(500, "Couldn't make the worksheet. Please try again in a moment.");
  }
}
