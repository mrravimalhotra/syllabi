import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAnswer } from "@/lib/generation/answers";
import { generateCompletion } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { QuotaExceededError, checkQuota } from "@/lib/quota";
import { cleanText } from "@/lib/validate";
import { loadBook } from "@/lib/study-pack/generate";
import { packToMarkdown } from "@/lib/study-pack/markdown";
import { REFINE_SYSTEM } from "@/lib/study-pack/prompts";
import { autoKeyFor } from "@/lib/study-pack/auto-key";
import { levelLine } from "@/lib/generation/level";
import { isAnswerLanguage, languageLine } from "@/lib/generation/language";
import type { PackQuestion, PackSection, StudyPack } from "@/lib/study-pack/types";
import type { Student } from "@/types/database";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

const SECTIONS = new Set<PackSection>(["textbookQuestions", "practiceQuestions"]);

/** The saved pack and the question the request points at, or an error response. */
async function target(request: Request, params: Params["params"]) {
  const auth = await authenticate();
  if ("response" in auth) return { error: auth.response };
  const user = auth.account;
  const saved = await findAnswer((await params).id, user);
  if (!saved?.pack) return { error: apiError(404, "This study pack was deleted or doesn't exist. Go back to My Documents.") };

  const body = await request.json().catch(() => null);
  if (body === null) return { error: apiError(400, "Your change couldn't be read. Try again.") };
  const section = body?.section as PackSection;
  const index = body?.index;
  const question: PackQuestion | undefined =
    SECTIONS.has(section) && Number.isInteger(index) && index >= 0 ? saved.pack[section][index] : undefined;
  if (!question) return { error: apiError(404, "That question is no longer in this study pack. Reload the page.") };
  return { user, saved, pack: saved.pack, section, index: index as number, question, body };
}

/** Tries this many times when another edit saves the pack at the same moment. */
const SAVE_TRIES = 4;

/**
 * Saves one changed question. The pack is read again just before writing and only this question is
 * replaced; the write only lands if the pack's version is unchanged, else it reads again and retries,
 * so two quick changes to different questions never undo each other.
 */
async function save(id: string, section: PackSection, index: number, question: PackQuestion): Promise<StudyPack> {
  const admin = createAdminClient();
  for (let attempt = 1; ; attempt++) {
    const { data, error: readError } = await admin.from("generated_documents").select("pack, pack_version").eq("id", id).single();
    // Before the version column exists (migration 30 not applied yet), save as before.
    if (readError && /pack_version/.test(readError.message)) return saveUnversioned(id, section, index, question);
    if (readError || !data?.pack) throw readError ?? new Error("Study pack not found");
    const fresh = data.pack as StudyPack;
    fresh[section][index] = question;
    const version = Number(data.pack_version ?? 0);
    const { data: written, error } = await admin
      .from("generated_documents")
      .update({ pack: fresh, content: packToMarkdown(fresh), pack_version: version + 1 })
      .eq("id", id)
      .eq("pack_version", version)
      .select("id");
    if (error) throw error;
    if (written?.length) return fresh;
    if (attempt >= SAVE_TRIES) throw new Error("The study pack kept changing while saving");
  }
}

async function saveUnversioned(id: string, section: PackSection, index: number, question: PackQuestion): Promise<StudyPack> {
  const admin = createAdminClient();
  const { data, error: readError } = await admin.from("generated_documents").select("pack").eq("id", id).single();
  if (readError || !data?.pack) throw readError ?? new Error("Study pack not found");
  const fresh = data.pack as StudyPack;
  fresh[section][index] = question;
  const { error } = await admin.from("generated_documents").update({ pack: fresh, content: packToMarkdown(fresh) }).eq("id", id);
  if (error) throw error;
  return fresh;
}

/** Rewrites one answer as the parent or tutor asks ("simpler", "for 5 marks"...), and saves it. */
export async function POST(request: Request, { params }: Params) {
  const t = await target(request, params);
  if ("error" in t) return t.error;
  const { user, saved, pack, section, index, question, body } = t;

  const ask = cleanText(body?.request, 500);
  if (!ask) return apiError(400, "Say how the answer should change, for example “make it simpler”.");

  try {
    const quota = await checkQuota(user.id);
    if (quota.overQuota) throw new QuotaExceededError(quota);
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
    const updated: PackQuestion = {
      ...question,
      answer,
      originalAnswer: question.originalAnswer ?? question.answer,
      autoKey: autoKeyFor(question.question, question.type, question.options, answer),
    };
    await save(saved.id, section, index, updated);
    return NextResponse.json({ question: updated });
  } catch (err) {
    return errorResponse(err, "study-pack refine", "Couldn't change this answer. Wait a moment and try again.");
  }
}

/** Sets one answer directly: used for Undo (back to an earlier version) and Restore (the AI's original). */
export async function PATCH(request: Request, { params }: Params) {
  const t = await target(request, params);
  if ("error" in t) return t.error;
  const { saved, section, index, question, body } = t;

  const answer = cleanText(body?.answer, 6000);
  if (!answer) return apiError(400, "The answer can't be empty.");
  const updated: PackQuestion = {
    ...question,
    answer,
    originalAnswer: question.originalAnswer ?? question.answer,
    autoKey: autoKeyFor(question.question, question.type, question.options, answer),
  };
  if (updated.originalAnswer === answer) delete updated.originalAnswer;
  try {
    await save(saved.id, section, index, updated);
    return NextResponse.json({ question: updated });
  } catch (err) {
    return errorResponse(err, "study-pack set answer", "Couldn't save this answer. Try again in a moment.");
  }
}

/** The chapter's text, when the pack came from a book that still exists. */
async function chapterFor(pack: StudyPack, user: Student): Promise<string | null> {
  if (!pack.sourceDocumentId) return null;
  try {
    return (await loadBook(pack.sourceDocumentId, user.id)).text;
  } catch (err) {
    // The answer can still be rewritten without the chapter; say so in the log.
    console.error("[study-pack refine] chapter text unavailable", err);
    return null;
  }
}
