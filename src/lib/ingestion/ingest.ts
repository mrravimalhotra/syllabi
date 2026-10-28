import { createAdminClient } from "@/lib/supabase/admin";
import { extractPageText } from "@/lib/ingestion/extract";
import { chunkPageText } from "@/lib/ingestion/chunk";
import { takeLegibility, type Legibility } from "@/lib/ingestion/confidence";
import { settleReading, worthReadingAgain } from "@/lib/ingestion/double-read";
import { measureImage } from "@/lib/ingestion/image-quality";
import { withoutHandwriting } from "@/lib/rag/handwriting";
import { recordPageRead } from "@/lib/ingestion/page-read";
import { embedMany } from "@/lib/llm";
import { recordTokenUsage } from "@/lib/llm/usage";
import { uploadSourceFile } from "@/lib/storage";
import type { SourceType } from "@/types/database";
import { logError } from "@/lib/error-log";
import { BlockedReplyError, DAILY_LIMIT, UserError, errorText } from "@/lib/errors";

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
  | { pageNumber: number; text: string; imageBase64?: undefined; mimeType?: undefined }
  // A digital PDF page: its own text (no AI reading) plus its image, kept so
  // answers see the page itself (diagrams, fractions, layout).
  | { pageNumber: number; text: string; imageBase64: string; mimeType: string; hint?: undefined };

/**
 * A page that couldn't be read or indexed: says which page and step, whether
 * trying again soon could help, and whether the AI's daily limit is the cause.
 */
export class IngestError extends UserError {
  constructor(
    message: string,
    readonly retryable = true,
    /** The AI's free daily allowance is used up: try again after it resets. */
    readonly dailyLimit = false
  ) {
    super(message);
  }
}

/** True when trying the same page again soon can't succeed (daily allowance used up, page declined). */
function hopeless(err: unknown): boolean {
  return err instanceof BlockedReplyError || DAILY_LIMIT.test(errorText(err));
}

/** A short, plain reason for a failure, from the provider's error text. */
function failureReason(err: unknown): string {
  const message = errorText(err);
  if (DAILY_LIMIT.test(message)) {
    return " (the reading service's daily limit was reached; it resets around 12:30 to 1:30 pm India time)";
  }
  if (err instanceof BlockedReplyError && err.finishReason === "RECITATION") return " (the AI declined to copy this page's printed text)";
  if (err instanceof BlockedReplyError) return " (the AI's safety filter refused this page)";
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(message)) return " (the reading service is rate-limited; wait a minute)";
  if (/\b50[0-4]\b|overloaded|UNAVAILABLE/i.test(message)) return " (the reading service was busy)";
  if (/SAFETY|blocked|safety filter/i.test(message)) return " (the AI's safety filter refused this page)";
  if (/timeout|timed out|ETIMEDOUT|aborted/i.test(message)) return " (it took too long)";
  if (/fetch failed|ECONNRESET|ENOTFOUND|network/i.test(message)) return " (a network problem)";
  return "";
}

export interface PageContext {
  documentId: string;
  ownerId: string;
  sourceType: SourceType;
}

/** What the AI read from a page picture before: kept so a retry after a saving failure doesn't read (and pay for) the page again. */
export interface EarlierRead {
  /** The AI's reply from an earlier try, if any; used instead of reading the page again. */
  text: string | null;
  /** Keeps a fresh reply until the page is saved. */
  keep: (text: string) => Promise<void>;
}

/** Where a failure happened, logged in full and reported as the page and step. */
function failAt(label: string, pageNumber: number, err: unknown): never {
  console.error(`[ingest] page ${pageNumber} (${label})`, err);
  if (!hopeless(err)) void logError({ source: "server", context: `ingest page ${pageNumber} (${label})`, error: err });
  throw new IngestError(`Page ${pageNumber}: ${label} failed${failureReason(err)}.`, !hopeless(err), DAILY_LIMIT.test(errorText(err)));
}

/**
 * Reads and indexes one page of a book: stores its image (unless
 * `storedImagePath` says it is stored already), reads its text with the AI
 * unless it already has text, then chunks, embeds and saves it. A page saved
 * before is replaced in one step, so a failure never leaves it missing from
 * search, and it is never duplicated.
 */
export async function ingestPage(ctx: PageContext, page: IngestPage, storedImagePath?: string, earlier?: EarlierRead): Promise<void> {
  const admin = createAdminClient();
  let imagePath: string | null = storedImagePath ?? null;

  // Store the page image (scans, photos, PDF pages); Word text has none.
  if (page.imageBase64 !== undefined && !storedImagePath) {
    const ext = MIME_EXTENSIONS[page.mimeType] ?? "bin";
    imagePath = `sources/${ctx.documentId}/page-${page.pageNumber}.${ext}`;
    await uploadSourceFile(imagePath, Buffer.from(page.imageBase64, "base64"), page.mimeType).catch((err) =>
      failAt("saving the page image", page.pageNumber, err)
    );
  }

  // Text from Word files and digital PDFs is used as it is; only pages
  // without text (scans, photos) are read by the AI.
  let pageText: string;
  // Only for pages the AI read from a picture: the reader's own rating of the page, for the book's scan score.
  let legibility: Legibility | null = null;
  let readFromPicture = false;
  // Three readings of an unclear page disagreed on its numbers.
  let numbersUnsure = false;
  if (page.text !== undefined) {
    pageText = page.text;
  } else if (earlier?.text) {
    ({ text: pageText, legibility } = takeLegibility(earlier.text));
    readFromPicture = true;
  } else {
    const extraction = await extractPageText(page.imageBase64, page.mimeType, page.hint).catch((err) =>
      failAt("reading the page", page.pageNumber, err)
    );
    await recordTokenUsage({
      studentId: ctx.ownerId,
      taskType: "ocr_extraction",
      provider: extraction.provider,
      model: extraction.model,
      usage: extraction.usage,
    });
    // The reader says "[EMPTY PAGE]" for a blank page: an empty reply is a failed read (a backup service answering nothing), not a blank page.
    if (!extraction.text.trim()) failAt("reading the page", page.pageNumber, new Error("The reader returned no text"));
    let raw = extraction.text;
    const first = takeLegibility(raw);
    const image = await measureImage(Buffer.from(page.imageBase64, "base64")).catch(() => null);
    if (worthReadingAgain(first.text, image, first.legibility)) {
      const settled = await settleReading(raw, () => extractPageText(page.imageBase64, page.mimeType, page.hint, true)).catch((err) => {
        // The extra reading is a check: if it fails, the first reading stands.
        console.warn(`[ingest] page ${page.pageNumber}: second reading failed`, errorText(err));
        return null;
      });
      for (const r of settled?.extra ?? []) {
        await recordTokenUsage({ studentId: ctx.ownerId, taskType: "ocr_extraction", provider: r.provider, model: r.model, usage: r.usage });
      }
      if (settled) ({ raw, unsure: numbersUnsure } = settled);
    }
    await earlier?.keep(raw);
    ({ text: pageText, legibility } = takeLegibility(raw));
    readFromPicture = true;
  }

  const textChunks = chunkPageText(pageText, page.pageNumber);

  // Embed first: if this fails, the page's earlier entries (from an earlier
  // read) are still in place.
  const embeddings =
    textChunks.length === 0
      ? []
      : await embedMany(textChunks.map((c) => withoutHandwriting(c.content) || c.content)).catch((err) => failAt("indexing the page", page.pageNumber, err));
  if (embeddings.length !== textChunks.length) {
    failAt("indexing the page", page.pageNumber, new Error(`Expected ${textChunks.length} embeddings, got ${embeddings.length}`));
  }

  // One database call replaces the page's entries (delete and insert together).
  const { error } = await admin.rpc("replace_page_chunks", {
    p_document_id: ctx.documentId,
    p_owner_id: ctx.ownerId,
    p_source_type: ctx.sourceType,
    p_page_number: page.pageNumber,
    p_image_path: imagePath,
    p_chunks: textChunks.map((chunk, i) => ({
      section_label: chunk.sectionLabel,
      chunk_index: i,
      content: chunk.content,
      embedding: embeddings[i].embedding,
    })),
  });
  if (error) failAt("saving the page", page.pageNumber, error);
  await recordPageRead({ documentId: ctx.documentId, ownerId: ctx.ownerId, pageNumber: page.pageNumber }, pageText, readFromPicture ? page.imageBase64 : undefined, legibility, numbersUnsure);

  const embeddingTokens = embeddings.reduce((sum, e) => sum + e.usage.totalTokens, 0);
  if (embeddingTokens > 0) {
    await recordTokenUsage({
      studentId: ctx.ownerId,
      taskType: "embedding",
      provider: "google",
      model: embeddings[0].model,
      usage: { inputTokens: embeddingTokens, outputTokens: 0, totalTokens: embeddingTokens },
    });
  }
}
