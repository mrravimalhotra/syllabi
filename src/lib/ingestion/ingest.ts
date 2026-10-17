import { createAdminClient } from "@/lib/supabase/admin";
import { extractPageText } from "@/lib/ingestion/extract";
import { chunkPageText } from "@/lib/ingestion/chunk";
import { embedMany } from "@/lib/llm";
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
  | { pageNumber: number; imageBase64: string; mimeType: string; hint?: string; text?: undefined }
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

/** A failed upload batch, with the book it belongs to so the browser can retry or clean up. */
export class IngestError extends UserError {
  constructor(
    message: string,
    readonly documentId: string
  ) {
    super(message);
  }
}

/** A short, plain reason for a failure, from the provider's error text. */
function failureReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(message)) return " (the AI's free-tier limit was reached; wait a minute)";
  if (/\b50[0-4]\b|overloaded|UNAVAILABLE/i.test(message)) return " (the AI service was busy)";
  if (/SAFETY|blocked|safety filter/i.test(message)) return " (the AI's safety filter refused this page)";
  if (/timeout|timed out|ETIMEDOUT|aborted/i.test(message)) return " (it took too long)";
  if (/fetch failed|ECONNRESET|ENOTFOUND|network/i.test(message)) return " (a network problem)";
  return "";
}

// Pages read at the same time. Reading a scanned page takes Gemini 15-25s, so
// one at a time made a 12-page chapter take minutes; more than 3 at once runs
// into the free tier's requests-per-minute limit.
const PAGES_AT_ONCE = 3;

/** Runs `fn` on every item, at most `limit` at a time; rejects on the first failure. */
async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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

  // Continuing (or retrying) a batch of an existing book: it is in progress again.
  if (input.documentId) {
    await admin.from("documents").update({ status: "processing" }).eq("id", documentId);
  }

  // Each step is labeled with which page/stage it failed at — an ingestion
  // error can originate from three very different systems (R2, Gemini,
  // Supabase), and an unlabeled error is nearly impossible to place. The full
  // detail goes to the server log; the user sees the page and step only.
  const stage = (label: string, pageNumber: number, err: unknown): never => {
    console.error(`[ingest] page ${pageNumber} (${label})`, err);
    throw new IngestError(
      `Page ${pageNumber}: ${label} failed${failureReason(err)}.`,
      documentId!
    );
  };

  try {
    await forEachLimited(input.pages, PAGES_AT_ONCE, async (page) => {
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

        const extraction = await extractPageText(page.imageBase64, page.mimeType, page.hint).catch((err) =>
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

      // A retried batch may have saved this page already: replace, don't duplicate.
      if (input.documentId) {
        await admin.from("chunks").delete().eq("document_id", documentId).eq("page_number", page.pageNumber);
      }

      // One request embeds all of the page's chunks; one insert saves them.
      const embeddings = await embedMany(textChunks.map((c) => c.content)).catch((err) =>
        stage("indexing the page", page.pageNumber, err)
      );
      const embeddingTokens = embeddings.reduce((sum, e) => sum + e.usage.totalTokens, 0);
      const embeddingModel = embeddings[0]?.model ?? "";
      if (textChunks.length > 0) {
        const { error: insertError } = await admin.from("chunks").insert(
          textChunks.map((chunk, i) => ({
            document_id: documentId,
            owner_id: input.ownerId,
            source_type: input.sourceType,
            page_number: page.pageNumber,
            section_label: chunk.sectionLabel,
            chunk_index: i,
            content: chunk.content,
            image_path: imagePath,
            embedding: embeddings[i].embedding,
          }))
        );
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
    });

    if (input.finalize !== false) {
      await admin.from("documents").update({ status: "ready" }).eq("id", documentId);
    }
  } catch (err) {
    await admin.from("documents").update({ status: "failed" }).eq("id", documentId);
    throw err;
  }

  return documentId;
}
