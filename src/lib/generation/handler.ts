import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { runGeneration } from "@/lib/generation/pipeline";
import { renderGenerationPdf } from "@/lib/pdf/render";
import { uploadPdf, getSignedUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuotaExceededError } from "@/lib/quota";
import type { CompletionImage } from "@/lib/llm/types";
import type { GenerationTaskType } from "@/types/database";

const MAX_PHOTOS = 3;
// Base64 characters per request across all photos — keeps the body well under
// Vercel's ~4.5 MB request limit. The browser downscales photos before sending.
const MAX_PHOTO_BASE64_CHARS = 3_000_000;
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DEFAULT_PHOTO_PROMPT: Record<GenerationTaskType, string> = {
  solution: "Solve the question(s) in the attached photo step by step.",
  notes: "Make revision notes on the topic shown in the attached photo.",
  sample_paper: "Make a sample paper on the topic shown in the attached photo.",
  ad_hoc: "Explain what is shown in the attached photo.",
};

/** Validates the optional `photos` field; returns the photos or an error message. */
function parsePhotos(raw: unknown): CompletionImage[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "photos must be a list";
  if (raw.length > MAX_PHOTOS) return `Attach at most ${MAX_PHOTOS} photos`;

  let totalChars = 0;
  const photos: CompletionImage[] = [];
  for (const p of raw) {
    if (typeof p?.data !== "string" || typeof p?.mimeType !== "string" || !PHOTO_MIME_TYPES.has(p.mimeType)) {
      return "Each photo must be a JPEG, PNG or WebP image";
    }
    totalChars += p.data.length;
    photos.push({ data: p.data, mimeType: p.mimeType });
  }
  if (totalChars > MAX_PHOTO_BASE64_CHARS) return "Photos are too large — attach fewer or smaller photos";
  return photos;
}

/** Builds a POST handler for one of the four generation routes — same pipeline, different task type. */
export function createGenerationRoute(taskType: GenerationTaskType) {
  return async function POST(request: Request) {
    const student = await getCurrentStudent();
    if (!student || !student.active) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const typedPrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

    const photos = parsePhotos(body?.photos);
    if (typeof photos === "string") {
      return NextResponse.json({ error: photos }, { status: 400 });
    }
    if (!typedPrompt && photos.length === 0) {
      return NextResponse.json({ error: "Type a question or attach a photo" }, { status: 400 });
    }
    const prompt = typedPrompt || DEFAULT_PHOTO_PROMPT[taskType];

    // Optional: which of the user's own books to search. Retrieval is always
    // limited to the caller's library, so ids of other users' books match nothing.
    const documentIds = Array.isArray(body?.documentIds)
      ? body.documentIds.filter((id: unknown): id is string => typeof id === "string")
      : undefined;

    try {
      const result = await runGeneration({ student, taskType, prompt, documentIds, photos });

      const title = !typedPrompt ? "Photo question" : prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt;
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
