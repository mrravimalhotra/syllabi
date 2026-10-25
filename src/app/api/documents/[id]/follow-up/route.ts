import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAnswer } from "@/lib/generation/answers";
import { FOLLOW_UP_SYSTEM, MAX_FOLLOW_UPS, MAX_FOLLOW_UP_CHARS, followUpPrompt, parseFollowUps, type FollowUp } from "@/lib/generation/follow-up";
import { levelLine } from "@/lib/generation/level";
import { generateCompletion } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { QuotaExceededError, checkQuota } from "@/lib/quota";
import { formatContext, retrieveContext } from "@/lib/rag/retrieve";
import { cleanText } from "@/lib/validate";

export const maxDuration = 120;

const GONE = "That answer no longer exists. Open My Documents to find it.";

/** Answers a follow-up question about one saved answer ("explain step 3 again") and keeps it with the answer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const saved = await findAnswer((await params).id, user);
  if (!saved || saved.content === null) return apiError(404, GONE);
  if (saved.pack) return apiError(400, "Study packs have their own tools: use “Change this answer” under each question.");

  const body = await request.json().catch(() => null);
  const raw = typeof body?.question === "string" ? body.question.trim() : "";
  if (raw.length > MAX_FOLLOW_UP_CHARS) return apiError(400, `Keep the follow-up under ${MAX_FOLLOW_UP_CHARS} characters, or ask it as a new question.`);
  const question = cleanText(raw, MAX_FOLLOW_UP_CHARS);
  if (!question) return apiError(400, "Type your follow-up question first, for example “explain step 3 again”.");
  const earlier = parseFollowUps(saved.follow_ups);
  if (earlier.length >= MAX_FOLLOW_UPS) return apiError(400, `This answer already has ${MAX_FOLLOW_UPS} follow-ups. Ask a new question on Ask Syllabi.`);

  try {
    const quota = await checkQuota(user.id);
    if (quota.overQuota) throw new QuotaExceededError(quota);

    // The closest book passages for the follow-up, so the reply stays with the books (a marked paper needs none).
    const context =
      saved.task_type === "paper_check"
        ? ""
        : await retrieveContext(`${question}\n${saved.title}`, { ownerId: user.id })
            .then((r) => formatContext(r.chunks))
            .catch((err) => {
              console.error("[follow-up] book search", err);
              return "";
            });

    const result = await generateCompletion({
      taskType: saved.task_type,
      systemInstructions: FOLLOW_UP_SYSTEM,
      prompt: followUpPrompt({ title: saved.title, answer: saved.content, earlier, question, level: levelLine(user) }),
      context: context || undefined,
      temperature: 0.3,
      maxOutputTokens: 2048,
    });
    await recordTokenUsage({ studentId: user.id, taskType: saved.task_type, provider: result.provider, model: result.model, usage: result.usage });

    const answer = result.text.trim().slice(0, 8000);
    if (!answer) throw new Error("Empty follow-up answer");
    const followUp: FollowUp = { question, answer, createdAt: new Date().toISOString() };
    const { data: count, error } = await createAdminClient().rpc("add_follow_up", { p_id: saved.id, p_item: followUp, p_max: MAX_FOLLOW_UPS });
    if (error) throw error;
    if (count === null) return apiError(400, `This answer already has ${MAX_FOLLOW_UPS} follow-ups. Ask a new question on Ask Syllabi.`);
    return NextResponse.json({ followUp });
  } catch (err) {
    return errorResponse(err, "follow-up", "Couldn't answer the follow-up. Wait a moment and try again.");
  }
}
