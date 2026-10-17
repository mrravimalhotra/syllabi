import { generateCompletion } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { retrieveContext, formatContext, loadSourceImages } from "@/lib/rag/retrieve";
import { checkQuota, QuotaExceededError } from "@/lib/quota";
import { systemInstructionsFor } from "@/lib/generation/prompts";
import type { CompletionImage } from "@/lib/llm/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationTaskType, MatchedChunk, Student } from "@/types/database";

export interface GenerationScope {
  schoolId: string;
  gradeId: string;
  subjectId: string;
}

export interface GenerationInput {
  student: Student;
  taskType: GenerationTaskType;
  prompt: string;
  /**
   * Query a specific school/grade/subject instead of the caller's profile
   * defaults. Admins may pick any school. A parent or tutor may pick any grade
   * of their assigned school and any of their assigned subjects (they help
   * students at several levels); see resolveScope.
   */
  scopeOverride?: GenerationScope;
}

export interface GenerationOutput {
  text: string;
  sources: MatchedChunk[];
  /** Source image_path → loaded image, so the PDF renderer can attach the right figure to the right citation. */
  sourceImages: Map<string, CompletionImage>;
  usedSearchGrounding: boolean;
}

/**
 * Shared generation pipeline: quota check → RAG retrieval → LLM call → usage
 * recording. Every generation route (solutions, notes, sample papers, ad-hoc)
 * calls this same function, differing only in taskType (which selects the
 * system prompt and, via llm_settings, the provider/model).
 */
export async function runGeneration({
  student,
  taskType,
  prompt,
  scopeOverride,
}: GenerationInput): Promise<GenerationOutput> {
  const quota = await checkQuota(student.id);
  if (quota.overQuota) throw new QuotaExceededError(quota);

  const scope = await resolveScope(student, scopeOverride);

  const retrieval = await retrieveContext(prompt, scope);

  const { images, byPath: sourceImages } = await loadSourceImages(retrieval.chunks);

  const result = await generateCompletion({
    taskType,
    systemInstructions: systemInstructionsFor(taskType),
    prompt,
    context: formatContext(retrieval.chunks),
    images,
    // Search grounding is opt-in per the RAG-first policy: only fires when
    // coverage from the knowledge base is weak.
    allowSearchGrounding: retrieval.coverageLow,
  });

  await recordTokenUsage({
    studentId: student.id,
    taskType,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
  });

  return {
    text: result.text,
    sources: retrieval.chunks,
    sourceImages,
    usedSearchGrounding: Boolean(result.usedSearchGrounding),
  };
}

/**
 * Works out which school/grade/subject to search. Admins can use any scope.
 * Everyone else is held to their assigned school: the grade must belong to it,
 * and the subject must be one of their assigned subjects. Without an override
 * the profile's own grade and first subject are used.
 */
async function resolveScope(student: Student, override?: GenerationScope): Promise<GenerationScope> {
  if (override && student.role === "admin") return override;

  if (!student.school_id) {
    throw new Error("Your profile has no school yet — ask an admin to complete it.");
  }
  if (student.subject_ids.length === 0) {
    throw new Error("Your profile has no subjects yet — ask an admin to add them.");
  }

  if (!override) {
    if (!student.grade_id) throw new Error("Choose a grade before generating.");
    return { schoolId: student.school_id, gradeId: student.grade_id, subjectId: student.subject_ids[0] };
  }

  if (override.schoolId !== student.school_id || !student.subject_ids.includes(override.subjectId)) {
    throw new Error("You can only generate for your own school and assigned subjects.");
  }
  const admin = createAdminClient();
  const { data: grade } = await admin
    .from("grades")
    .select("id")
    .eq("id", override.gradeId)
    .eq("school_id", student.school_id)
    .maybeSingle();
  if (!grade) throw new Error("That grade does not belong to your school.");

  return override;
}
