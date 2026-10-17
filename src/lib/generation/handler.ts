import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { runGeneration } from "@/lib/generation/pipeline";
import { renderGenerationPdf } from "@/lib/pdf/render";
import { uploadPdf, getSignedUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuotaExceededError } from "@/lib/quota";
import type { GenerationTaskType } from "@/types/database";

/** Builds a POST handler for one of the four generation routes — same pipeline, different task type. */
export function createGenerationRoute(taskType: GenerationTaskType) {
  return async function POST(request: Request) {
    const student = await getCurrentStudent();
    if (!student || !student.active) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "A prompt/topic is required" }, { status: 400 });
    }

    // Optional school/grade/subject choice — validated against the caller's
    // permissions inside runGeneration.
    const scopeOverride =
      typeof body?.schoolId === "string" && typeof body?.gradeId === "string" && typeof body?.subjectId === "string"
        ? { schoolId: body.schoolId, gradeId: body.gradeId, subjectId: body.subjectId }
        : undefined;

    try {
      const result = await runGeneration({ student, taskType, prompt, scopeOverride });

      const title = prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt;
      const pdfBuffer = await renderGenerationPdf({
        taskType,
        title,
        studentName: student.full_name ?? student.email,
        content: result.text,
        sources: result.sources,
        sourceImages: result.sourceImages,
      });

      const path = `generated/${student.id}/${taskType}-${Date.now()}.pdf`;
      await uploadPdf(path, pdfBuffer);

      const admin = createAdminClient();
      const { data: doc, error } = await admin
        .from("generated_documents")
        .insert({ student_id: student.id, task_type: taskType, title, storage_path: path })
        .select()
        .single();
      if (error) throw new Error(`Failed to save document record: ${error.message}`);

      const downloadUrl = await getSignedUrl(path);

      // Give the on-screen result the same source images the PDF embeds, so a
      // diagram/map is visible before the student even downloads the PDF.
      const imagePaths = [...new Set(result.sources.map((s) => s.image_path).filter((p): p is string => Boolean(p)))];
      const imageUrlEntries = await Promise.all(imagePaths.map(async (p) => [p, await getSignedUrl(p)] as const));
      const imageUrlByPath = new Map(imageUrlEntries);
      const sources = result.sources.map((s) => ({
        ...s,
        imageUrl: s.image_path ? imageUrlByPath.get(s.image_path) : undefined,
      }));

      return NextResponse.json({
        id: doc.id,
        title,
        text: result.text,
        sources,
        usedSearchGrounding: result.usedSearchGrounding,
        downloadUrl,
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return NextResponse.json(
          { error: "Monthly token quota exceeded. Contact an admin to raise your limit.", quota: err.status },
          { status: 429 }
        );
      }
      const message = err instanceof Error ? err.message : "Generation failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
