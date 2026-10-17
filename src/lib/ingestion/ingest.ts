import { createAdminClient } from "@/lib/supabase/admin";
import { extractPageText } from "@/lib/ingestion/extract";
import { chunkPageText } from "@/lib/ingestion/chunk";
import { embed } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { uploadSourceFile } from "@/lib/storage";
import type { DocumentRow } from "@/types/database";
import { UserError } from "@/lib/errors";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * One page to index: either a page image (scans, photos, PDF pages), which is
 * stored and read by the AI, or text already extracted in the browser (Word
 * files), which is indexed directly with no image and no AI reading step.
 */
export type IngestPage =
  | { pageNumber: number; imageBase64: string; mimeType: string; text?: undefined }
  | { pageNumber: number; text: string; imageBase64?: undefined; mimeType?: undefined };

export interface IngestDocumentInput {
  title: string;
  /** The account uploading the book — it becomes the owner, and the reading/indexing cost counts against its quota. */
  ownerId: string;
  subject: string | null;
  grade: string | null;
  sourceType: DocumentRow["source_type"];
  pages: IngestPage[];
  /**
   * Append these pages to an already-created document instead of creating a
   * new one — used when a large upload is split into several requests to stay
   * under a single request's practical body-size ceiling. Omit for the first
   * (or only) batch of a document.
   */
  documentId?: string;
  /** Mark the document "ready" once this call's pages are ingested. Defaults to true — set false on every batch except the last when splitting one document across multiple calls. */
  finalize?: boolean;
}

/**
 * Full ingestion pipeline for one uploaded document: vision text extraction per
 * page → chunking → embedding → pgvector insert, owned by (and searchable only
 * by) the uploading account. Every page's image is also persisted and linked
 * to its chunks — text alone loses diagrams/maps/figures, so retrieval and
 * generation need the original image, not just its OCR'd caption. Runs to
 * completion (or through this batch, when `documentId`/`finalize` are used to
 * span multiple calls) or marks the document failed.
 */
export async function ingestDocument(input: IngestDocumentInput): Promise<string> {
  const admin = createAdminClient();

  let documentId = input.documentId;
  if (!documentId) {
    try {
      const { data: document, error: docError } = await admin
        .from("documents")
        .insert({
          title: input.title,
          owner_id: input.ownerId,
          subject: input.subject,
          grade: input.grade,
          rights_confirmed_at: new Date().toISOString(),
          source_type: input.sourceType,
          storage_path: null,
          uploaded_by: input.ownerId,
          status: "processing",
        })
        .select()
        .single();

      if (docError || !document) throw docError ?? new Error("no document row returned");
      documentId = document.id as string;
    } catch (err) {
      console.error("[ingest] creating document row", err);
      throw new UserError("Couldn't start the upload. Please try again.");
    }
  }

  // Each step is labeled with which page/stage it failed at — an ingestion
  // error can originate from three very different systems (R2, Gemini,
  // Supabase), and an unlabeled error is nearly impossible to place. The full
  // detail goes to the server log; the user sees the page and step only.
  const stage = (label: string, pageNumber: number, err: unknown): never => {
    console.error(`[ingest] page ${pageNumber} (${label})`, err);
    throw new UserError(`Page ${pageNumber}: ${label.charAt(0).toUpperCase()}${label.slice(1)} failed. Delete this book and try again.`);
  };

  try {
    for (const page of input.pages) {
      let imagePath: string | null = null;
      let pageText: string;

      if (page.text !== undefined) {
        pageText = page.text;
      } else {
        const ext = MIME_EXTENSIONS[page.mimeType] ?? "bin";
        const path = `sources/${documentId}/page-${page.pageNumber}.${ext}`;
        imagePath = path;

        await uploadSourceFile(path, Buffer.from(page.imageBase64, "base64"), page.mimeType).catch((err) =>
          stage("saving the page image", page.pageNumber, err)
        );

        if (page.pageNumber === 1 && !input.documentId) {
          const { error } = await admin.from("documents").update({ storage_path: path }).eq("id", documentId);
          if (error) stage("saving the page preview", page.pageNumber, error);
        }

        const extraction = await extractPageText(page.imageBase64, page.mimeType).catch((err) =>
          stage("reading the page", page.pageNumber, err)
        );
        await recordTokenUsage({
          studentId: input.ownerId,
          taskType: "ocr_extraction",
          provider: extraction.provider,
          model: extraction.model,
          usage: extraction.usage,
        });
        pageText = extraction.text;
      }
      const textChunks = chunkPageText(pageText, page.pageNumber);

      let embeddingTokens = 0;
      let embeddingModel = "";
      for (const chunk of textChunks) {
        const result = await embed(chunk.content).catch((err) => stage("indexing the page", page.pageNumber, err));
        embeddingTokens += result.usage.totalTokens;
        embeddingModel = result.model;
        const { error: insertError } = await admin.from("chunks").insert({
          document_id: documentId,
          owner_id: input.ownerId,
          source_type: input.sourceType,
          page_number: page.pageNumber,
          section_label: chunk.sectionLabel,
          content: chunk.content,
          image_path: imagePath,
          embedding: result.embedding,
        });
        if (insertError) stage("saving the page", page.pageNumber, insertError);
      }
      if (embeddingTokens > 0) {
        await recordTokenUsage({
          studentId: input.ownerId,
          taskType: "embedding",
          provider: "google",
          model: embeddingModel,
          usage: { inputTokens: embeddingTokens, outputTokens: 0, totalTokens: embeddingTokens },
        });
      }
    }

    if (input.finalize !== false) {
      await admin.from("documents").update({ status: "ready" }).eq("id", documentId);
    }
  } catch (err) {
    await admin.from("documents").update({ status: "failed" }).eq("id", documentId);
    throw err;
  }

  return documentId;
}
