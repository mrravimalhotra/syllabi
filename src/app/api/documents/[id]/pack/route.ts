import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAnswer } from "@/lib/generation/answers";
import { generateCompletion } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { checkQuota } from "@/lib/quota";
import { userMessage } from "@/lib/errors";
import { cleanText } from "@/lib/validate";
import { loadBook } from "@/lib/study-pack/generate";
import { packToMarkdown } from "@/lib/study-pack/markdown";
import { REFINE_SYSTEM } from "@/lib/study-pack/prompts";
import { levelLine } from "@/lib/generation/level";
import { isAnswerLanguage, languageLine } from "@/lib/generation/language";
import type { PackQuestion, PackSection, StudyPack } from "@/lib/study-pack/types";
import type { Student } from "@/types/database";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

const SECTIONS = new Set<PackSection>(["textbookQuestions", "practiceQuestions"]);

/** The saved pack and the question the request points at, or an error response. */
async function target(request: Request, params: Params["params"]) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const saved = await findAnswer((await params).id, user);
  if (!saved?.pack) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  const body = await request.json().catch(() => null);
  const section = body?.section as PackSection;
  const index = body?.index;
  const question: PackQuestion | undefined =
    SECTIONS.has(section) && Number.isInteger(index) ? saved.pack[section][index] : undefined;
  if (!question) return { error: NextResponse.json({ error: "Question not found" }, { status: 400 }) };
  return { user, saved, pack: saved.pack, section, index: index as number, question, body };
}

async function save(id: string, pack: StudyPack) {
  const admin = createAdminClient();
  const { error } = await admin.from("generated_documents").update({ pack, content: packToMarkdown(pack) }).eq("id", id);
  if (error) throw error;
}

/** Rewrites one answer as the parent or tutor asks ("simpler", "for 5 marks"...), and saves it. */
export async function POST(request: Request, { params }: Params) {
  const t = await target(request, params);
  if ("error" in t) return t.error;
  const { user, saved, pack, section, index, question, body } = t;

  const ask = cleanText(body?.request, 500);
  if (!ask) return NextResponse.json({ error: "Say how the answer should change" }, { status: 400 });

  try {
    const quota = await checkQuota(user.id);
    if (quota.overQuota) {
      return NextResponse.json({ error: "Monthly token quota exceeded. Contact an admin to raise your limit." }, { status: 429 });
    }
    const chapter = await chapterFor(pack, user);
    const result = await generateCompletion({
      taskType: "study_pack",
      systemInstructions: REFINE_SYSTEM,
      prompt: [
        chapter ? `Chapter text:\n"""\n${chapter}\n"""\n` : "",
        levelLine(user),
        languageLine(isAnswerLanguage(pack.language) ? pack.language : "auto"),
        `Question: ${question.question}`,
        question.marks ? `Marks: ${question.marks}` : "",
        question.evidence ? `Evidence from the chapter: "${question.evidence}"` : "",
        `Current answer: ${question.answer}`,
        `Requested change: ${ask}`,
        "Write the improved answer now.",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.3,
      maxOutputTokens: 4096,
    });
    await recordTokenUsage({
      studentId: user.id,
      taskType: "study_pack",
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    });

    const answer = result.text.trim().slice(0, 6000);
    if (!answer) throw new Error("Empty refined answer");
    const updated: PackQuestion = { ...question, answer, originalAnswer: question.originalAnswer ?? question.answer };
    pack[section][index] = updated;
    await save(saved.id, pack);
    return NextResponse.json({ question: updated });
  } catch (err) {
    return NextResponse.json(
      { error: userMessage(err, "study-pack refine", "Couldn't change the answer right now. Please try again.") },
      { status: 500 }
    );
  }
}

/** Sets one answer directly: used for Undo (back to an earlier version) and Restore (the AI's original). */
export async function PATCH(request: Request, { params }: Params) {
  const t = await target(request, params);
  if ("error" in t) return t.error;
  const { saved, pack, section, index, question, body } = t;

  const answer = cleanText(body?.answer, 6000);
  if (!answer) return NextResponse.json({ error: "An answer is required" }, { status: 400 });
  const updated: PackQuestion = { ...question, answer, originalAnswer: question.originalAnswer ?? question.answer };
  if (updated.originalAnswer === answer) delete updated.originalAnswer;
  pack[section][index] = updated;
  try {
    await save(saved.id, pack);
    return NextResponse.json({ question: updated });
  } catch (err) {
    return NextResponse.json({ error: userMessage(err, "study-pack set answer") }, { status: 500 });
  }
}

/** The chapter's text, when the pack came from a book that still exists. */
async function chapterFor(pack: StudyPack, user: Student): Promise<string | null> {
  if (!pack.sourceDocumentId) return null;
  try {
    return (await loadBook(pack.sourceDocumentId, user.id)).text;
  } catch {
    return null;
  }
}
