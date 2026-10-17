// Background reading of book pages. The phone sends page images, which are
// stored and queued here in seconds; the server then reads each page with the
// AI on its own time, so an upload finishes even if the app is closed.
//
// Reading runs after the upload request has answered (Next's `after`), keeps
// going for as long as a server function may run, then hands over to a fresh
// run. A database timer every minute also starts a run whenever pages are
// waiting, e.g. after the AI's daily allowance resets.

import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFile, uploadSourceFile } from "@/lib/storage";
import { IngestError, ingestPage, type IngestPage } from "@/lib/ingestion/ingest";
import type { UploadPage } from "@/lib/ingestion/upload-pages";
import type { DocumentRow } from "@/types/database";

/** Pages read at the same time across the whole app (the AI's free tier allows few requests a minute). */
const MAX_WORKING = 2;
// A run stops taking new pages after this long, leaving time to finish the
// page in hand within the server's 300-second limit.
const STOP_TAKING_PAGES_AFTER_MS = 150_000;
// A failing page is tried this many times in all, waiting longer each time.
const MAX_ATTEMPTS = 5;
const RETRY_AFTER_MINUTES = [1, 3, 10, 30];

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

interface Job {
  id: string;
  document_id: string;
  owner_id: string;
  page_number: number;
  image_path: string | null;
  mime_type: string | null;
  page_text: string | null;
  hint: string | null;
  source_type: DocumentRow["source_type"] | null;
  attempts: number;
}

/** Stores the pages of a book and queues them for reading. A page queued again replaces the earlier one. */
export async function queuePages(documentId: string, ownerId: string, pages: UploadPage[], startPageNumber: number): Promise<void> {
  const admin = createAdminClient();
  const rows = await Promise.all(
    pages.map(async (p, i) => {
      const pageNumber = startPageNumber + i;
      let imagePath: string | null = null;
      if (p.imageBase64 && p.mimeType) {
        imagePath = `sources/${documentId}/page-${pageNumber}.${EXTENSIONS[p.mimeType] ?? "bin"}`;
        await uploadSourceFile(imagePath, Buffer.from(p.imageBase64, "base64"), p.mimeType);
      }
      return {
        document_id: documentId,
        owner_id: ownerId,
        page_number: pageNumber,
        image_path: imagePath,
        mime_type: p.mimeType ?? null,
        page_text: "text" in p ? p.text : null,
        hint: "hint" in p ? (p.hint ?? null) : null,
        source_type: p.sourceType ?? null,
        status: "pending",
        attempts: 0,
        error: null,
        next_attempt_at: new Date().toISOString(),
        locked_at: null,
      };
    })
  );
  const { error } = await admin.from("page_jobs").upsert(rows, { onConflict: "document_id,page_number" });
  if (error) throw error;
  await admin.from("documents").update({ status: "processing" }).eq("id", documentId);
}

/** Pages the AI couldn't read go back in the queue. */
export async function retryFailedPages(documentId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("page_jobs")
    .update({ status: "pending", attempts: 0, error: null, next_attempt_at: new Date().toISOString() })
    .eq("document_id", documentId)
    .eq("status", "failed")
    .select("id");
  if (data?.length) await admin.from("documents").update({ status: "processing" }).eq("id", documentId);
  return data?.length ?? 0;
}

/** Remembers the app's address, so the database's timer can call it. */
export async function rememberAppUrl(origin: string): Promise<void> {
  if (!/^https:\/\//.test(origin)) return; // local development has no timer
  await createAdminClient().from("job_runner").update({ app_url: origin }).eq("id", 1);
}

export async function jobToken(): Promise<string | null> {
  const { data } = await createAdminClient().from("job_runner").select("token").eq("id", 1).maybeSingle();
  return data?.token ?? null;
}

/** When the AI's free daily allowance comes back: just after midnight Pacific time. */
function nextDailyReset(): Date {
  const now = new Date();
  // Midnight Pacific is 07:00 UTC in summer and 08:00 in winter; 08:05 covers both.
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 5));
  if (reset <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset;
}

async function readOne(job: Job): Promise<void> {
  const admin = createAdminClient();
  const { data: book } = await admin.from("documents").select("id, owner_id, source_type").eq("id", job.document_id).maybeSingle();
  if (!book) return; // deleted meanwhile; its jobs go with it

  try {
    let page: IngestPage;
    if (job.page_text !== null) {
      // The page image (if any) is already stored; ingestPage links it without uploading again.
      page = job.image_path && job.mime_type
        ? { pageNumber: job.page_number, text: job.page_text, imageBase64: "", mimeType: job.mime_type }
        : { pageNumber: job.page_number, text: job.page_text };
    } else {
      const image = await downloadFile(job.image_path!);
      page = { pageNumber: job.page_number, imageBase64: image.data.toString("base64"), mimeType: job.mime_type ?? image.contentType, hint: job.hint ?? undefined };
    }
    // A page keeps its own kind (e.g. the exercises after a chapter) within its book.
    await ingestPage({ documentId: book.id, ownerId: book.owner_id, sourceType: job.source_type ?? book.source_type }, page, job.image_path ?? undefined);
    await admin.from("page_jobs").update({ status: "done", error: null, locked_at: null }).eq("id", job.id);
  } catch (err) {
    const message = err instanceof IngestError ? err.message : `Page ${job.page_number}: reading the page failed.`;
    if (!(err instanceof IngestError)) console.error("[jobs] page", job.page_number, err);
    const daily = err instanceof IngestError && err.dailyLimit;
    const again = daily || ((!(err instanceof IngestError) || err.retryable) && job.attempts < MAX_ATTEMPTS);
    const wait = daily ? nextDailyReset() : new Date(Date.now() + (RETRY_AFTER_MINUTES[job.attempts - 1] ?? 30) * 60_000);
    await admin
      .from("page_jobs")
      .update({
        status: again ? "pending" : "failed",
        error: message,
        locked_at: null,
        next_attempt_at: wait.toISOString(),
        // A daily-limit wait doesn't count as a try.
        ...(daily ? { attempts: job.attempts - 1 } : {}),
      })
      .eq("id", job.id);
  }
  await finishBookIfDone(job.document_id);
}

/** A book with no pages left to read is ready (if any page was read) or failed. */
async function finishBookIfDone(documentId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("page_jobs").select("status").eq("document_id", documentId);
  if (!jobs?.length || jobs.some((j) => j.status === "pending" || j.status === "working")) return;
  const read = jobs.some((j) => j.status === "done");
  await admin.from("documents").update({ status: read ? "ready" : "failed" }).eq("id", documentId).eq("status", "processing");
}

/**
 * Reads queued pages until none are due or this run's time is up; then, if
 * pages are still waiting, starts a fresh run at `origin` to carry on.
 */
export async function readQueuedPages(origin: string | null): Promise<void> {
  const admin = createAdminClient();
  const started = Date.now();
  let timeUp = false;
  const worker = async () => {
    for (;;) {
      if (Date.now() - started > STOP_TAKING_PAGES_AFTER_MS) {
        timeUp = true;
        return;
      }
      const { data, error } = await admin.rpc("claim_page_job", { max_working: MAX_WORKING });
      if (error) {
        console.error("[jobs] claiming a page", error);
        return;
      }
      const job = (data as Job[] | null)?.[0];
      if (!job) return;
      await readOne(job);
    }
  };
  await Promise.all(Array.from({ length: MAX_WORKING }, worker));
  if (timeUp && origin) await startRun(origin);
}

/** Asks the app (a fresh server run) to read queued pages; returns at once. */
export async function startRun(origin: string): Promise<void> {
  const token = await jobToken();
  if (!token) return;
  await fetch(`${origin}/api/jobs/pages`, {
    method: "POST",
    headers: { "x-job-token": token },
    signal: AbortSignal.timeout(15_000),
  }).catch((err) => console.error("[jobs] starting a new run", err));
}

export interface PageProgress {
  total: number;
  done: number;
  failed: number;
  /** Why pages failed or are waiting, newest first, without repeats. */
  problems: string[];
  /** Pages waiting for the AI's daily allowance, and when it resets. */
  waitingUntil: string | null;
}

/** Reading progress of each of an owner's books that has queued pages. */
export async function pageProgress(ownerId: string): Promise<Record<string, PageProgress>> {
  const { data } = await createAdminClient()
    .from("page_jobs")
    .select("document_id, status, error, next_attempt_at")
    .eq("owner_id", ownerId);
  const out: Record<string, PageProgress> = {};
  const soon = Date.now() + 2 * 3600_000;
  for (const j of data ?? []) {
    const p = (out[j.document_id] ??= { total: 0, done: 0, failed: 0, problems: [], waitingUntil: null });
    p.total++;
    if (j.status === "done") p.done++;
    if (j.status === "failed") p.failed++;
    if (j.error && j.status !== "done") {
      const reason = j.error.replace(/^Page \d+: /, "");
      if (!p.problems.includes(reason)) p.problems.push(reason);
      if (j.status === "pending" && Date.parse(j.next_attempt_at) > soon) p.waitingUntil = j.next_attempt_at;
    }
  }
  return out;
}
