import {
  PARALLEL_REQUESTS,
  RETRY_WAIT_MS,
  UPLOAD_ATTEMPTS,
  groupByBook,
  mainKind,
  toRequests,
  uploadShape,
  wait,
  type PendingPage,
} from "@/app/dashboard/library/_parts/upload-helpers";

/** What the upload needs from the screen: the book's details, and ways to show progress. */
export interface UploadJob {
  title: string;
  subject: string;
  grade: string;
  rightsConfirmed: boolean;
  pages: PendingPage[];
  signal: AbortSignal;
  /** Text under the progress bar (null clears it). */
  progress: (text: string | null) => void;
  /** Pages saved so far in this upload. */
  sent: (count: number) => void;
  /** A new book was started: these pages now belong to it, with these numbers. */
  numbered: (bookId: string, numbers: Map<string, number | undefined>) => void;
  /** These pages are saved, so they leave the list below. */
  saved: (ids: string[]) => void;
  /** A book this upload is filling (so it is not shown as unfinished). */
  active: (bookId: string) => void;
  /** Refresh the book list. */
  reload: () => void;
  /** Deletes a book (used for a new book that got none of its pages). */
  removeBook: (id: string) => Promise<boolean>;
}

export interface UploadOutcome {
  saved: Set<string>;
  /** Page id → why it didn't go. */
  failures: Map<string, string>;
  /** A failure that stopped the whole upload, or null. */
  fatal: string | null;
}

/** Shared by the workers: what has gone so far, and a failure every later page would hit too. */
interface Run {
  saved: Set<string>;
  failures: Map<string, string>;
  stopReason: string | null;
  sent: number;
}

function failureReason(status: number, serverMessage: string | undefined): string {
  if (serverMessage) return serverMessage;
  if (status === 413) return "This page is too large to send. Add it again as a smaller photo.";
  if (status === 401) return "You were signed out. Sign in again, then press Upload to continue.";
  return "The page couldn't be sent. Check your connection, then press Upload to try again.";
}

/** One request to the server for a batch of pages. A dropped connection comes back as a 503, not an error. */
async function postBatch(
  bookId: string,
  batch: PendingPage[],
  signal: AbortSignal
): Promise<{ res: Response; data: { error?: string; retryable?: boolean } } | "aborted"> {
  try {
    const res = await fetch(`/api/library/${bookId}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ pages: batch.map(uploadShape), startPageNumber: batch[0].pageNumber }),
    });
    const data = await res.json().catch(() => ({ error: res.status === 504 ? "The server took too long." : undefined }));
    return { res, data };
  } catch {
    if (signal.aborted) return "aborted";
    return { res: new Response(null, { status: 503 }), data: { error: "The connection dropped." } };
  }
}

/** Sends one batch, trying again (with a growing wait) when the server says trying again can help. */
async function sendBatch(bookId: string, batch: PendingPage[], job: UploadJob, run: Run): Promise<void> {
  const first = batch[0].pageNumber!;
  const name = batch.length === 1 ? `page ${first}` : `pages ${first}–${first + batch.length - 1}`;
  for (let attempt = 1; ; attempt++) {
    const result = await postBatch(bookId, batch, job.signal);
    if (result === "aborted") return;
    const { res, data } = result;
    if (res.ok) {
      batch.forEach((p) => run.saved.add(p.id));
      run.sent += batch.length;
      job.sent(run.sent);
      job.saved(batch.map((p) => p.id));
      return;
    }
    const reason = failureReason(res.status, data.error);
    const retry = res.status >= 500 && data.retryable !== false && attempt < UPLOAD_ATTEMPTS;
    if (!retry) {
      batch.forEach((p) => run.failures.set(p.id, reason));
      if (res.status === 404 || /daily allowance|quota exceeded/i.test(reason)) run.stopReason = reason;
      return;
    }
    job.progress(`${reason} Trying ${name} again (${attempt + 1} of ${UPLOAD_ATTEMPTS})`);
    await wait(RETRY_WAIT_MS * attempt);
    if (job.signal.aborted) return;
  }
}

/** A new book is created first, so a retried page can never start a second copy of it. Returns its id. */
async function startBook(group: PendingPage[], job: UploadJob): Promise<string> {
  job.progress(`Starting "${job.title.trim()}"`);
  const res = await fetch("/api/library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: job.signal,
    body: JSON.stringify({
      title: job.title.trim(),
      subject: job.subject.trim(),
      grade: job.grade.trim(),
      rightsConfirmed: job.rightsConfirmed,
      sourceType: mainKind(group),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.documentId) throw new Error(data.error ?? "Couldn't start the upload. Please try again.");
  return data.documentId as string;
}

/** Uploads every page, book by book: pages that already belong to a book go into it, the rest start a new one. */
export async function uploadPages(job: UploadJob): Promise<UploadOutcome> {
  const run: Run = { saved: new Set(), failures: new Map(), stopReason: null, sent: 0 };
  let fatal: string | null = null;
  try {
    for (let group of groupByBook(job.pages)) {
      if (job.signal.aborted || run.stopReason) break;

      const createdNow = !group[0].bookId;
      if (createdNow) {
        const newId = await startBook(group, job);
        group = group.map((p, i) => ({ ...p, bookId: newId, pageNumber: i + 1 }));
        job.numbered(newId, new Map(group.map((p) => [p.id, p.pageNumber])));
        job.reload();
      }
      const bookId = group[0].bookId!;
      job.active(bookId);

      const queue = toRequests(group);
      const worker = async () => {
        for (let batch = queue.shift(); batch; batch = queue.shift()) {
          if (job.signal.aborted || run.stopReason) return;
          await sendBatch(bookId, batch, job, run);
          if (!run.stopReason) job.progress("Sending the pages");
        }
      };
      job.progress("Sending the pages");
      await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker));

      // A book started now that got none of its pages is removed; the pages stay below to try again.
      if (createdNow && !group.some((p) => run.saved.has(p.id))) await job.removeBook(bookId);
    }
  } catch (err) {
    if (!job.signal.aborted)
      fatal =
        err instanceof Error ? err.message : "The upload stopped unexpectedly. Check your connection, then press Upload to try again.";
  }
  return { saved: run.saved, failures: run.failures, fatal };
}

/** The message shown when an upload ends: all pages sent, or what is left and why. */
export function describeOutcome(
  outcome: UploadOutcome,
  total: number,
  title: string,
  stopped: boolean
): { success: string | null; error: string | null } {
  const { saved, failures, fatal } = outcome;
  const sent = saved.size;
  const left = total - sent;
  const s = (n: number) => (n === 1 ? "" : "s");
  if (left === 0) {
    const minutes = Math.max(1, Math.ceil((sent * 12) / 60));
    return {
      success:
        `All ${sent} page${s(sent)} of "${title.trim()}" sent. ` +
        `Syllabi is reading them now, about ${minutes} minute${s(minutes)}. You can close the app: reading carries on, and the book shows Ready when it's done.`,
      error: null,
    };
  }
  const reasons = [...new Set(failures.values())];
  const same = sent > 0 ? " (they go into the same book)" : "";
  return {
    success: null,
    error: [
      stopped
        ? `Upload stopped. ${left} page${left === 1 ? " is" : "s are"} still below: press Upload to continue${same}.`
        : `${left} page${left === 1 ? " is" : "s are"} still below: press Upload to try again${same}.`,
      !stopped && fatal ? fatal : null,
      reasons.length ? `Why: ${reasons.join(" ")}` : null,
      sent > 0 ? `${sent} page${s(sent)} ${sent === 1 ? "was" : "were"} already sent and ${sent === 1 ? "is" : "are"} being read.` : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
