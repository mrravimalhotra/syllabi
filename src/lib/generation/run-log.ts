// A progress record for one answer request (table generation_runs): the stage it reached, when each stage was
// reached, the size of the request and how it ended. Written as the answer is made, so a request the hosting stopped
// at its time limit still shows where it was. Writing it never slows or fails the answer: every write is in the
// background and every error is swallowed.

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationTaskType } from "@/types/database";

type RunOutcome = "answered" | "reused" | "failed";

export interface RunLog {
  /** The record's id, shown to the person with an error so it can be looked up. */
  id: string;
  /** A stage reached, with anything learned on the way (sizes, counts, the model). Repeated stages keep the first time. */
  stage(name: string, details?: Record<string, unknown>): void;
  /** How the request ended. */
  finish(outcome: RunOutcome, details?: { error?: string; documentId?: string | null; [key: string]: unknown }): void;
}

/** Once in this many requests, records older than 30 days (or beyond the newest 2000) are removed. */
const PURGE_EVERY = 50;

const seconds = (ms: number) => Math.round(ms / 100) / 10;

/** Text with anything that looks like a key blanked out. */
const scrub = (text: string) => text.replace(/AIza[\w-]{10,}|sb_(secret|publishable)_[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|gsk_[\w-]{10,}/g, "[key]").slice(0, 600);

export function startRunLog(studentId: string, taskType: GenerationTaskType, request: Record<string, unknown>): RunLog {
  const id = crypto.randomUUID();
  const start = Date.now();
  const stages: Record<string, number> = { started: 0 };
  const details: Record<string, unknown> = { request };
  let last = "started";
  let ended = false;

  const table = () => createAdminClient().from("generation_runs");
  const swallow = (err: unknown) => console.warn("[run-log]", err instanceof Error ? err.message : err);
  // Writes go one after another, so a later stage never lands before an earlier one.
  let chain: Promise<unknown> = Promise.resolve()
    .then(() => table().insert({ id, student_id: studentId, task_type: taskType, details: { ...details, stages } }))
    .catch(swallow);
  const write = (row: Record<string, unknown>) => {
    chain = chain
      .then(() => table().update({ ...row, updated_at: new Date().toISOString(), details: { ...details, stages } }).eq("id", id))
      .catch(swallow);
    return chain;
  };
  if (Math.random() < 1 / PURGE_EVERY) chain = chain.then(() => createAdminClient().rpc("purge_generation_runs")).catch(swallow);

  return {
    id,
    stage(name, more) {
      if (ended) return;
      stages[name] ??= seconds(Date.now() - start);
      if (more) Object.assign(details, more);
      last = name;
      void write({ stage: name });
    },
    finish(outcome, more = {}) {
      if (ended) return;
      ended = true;
      const { error, documentId, ...rest } = more;
      Object.assign(details, rest);
      const stage = outcome === "failed" ? "failed" : "done";
      stages[stage] = seconds(Date.now() - start);
      const final = write({
        stage,
        outcome,
        error: error ? scrub(error) : null,
        document_id: documentId ?? null,
      });
      // The last write may come after the reply is sent; keep the server running until it is saved.
      try {
        after(() => final);
      } catch {
        // Outside a request (tests): the write simply runs on.
      }
      if (outcome === "failed") console.warn(`[run-log] ${id} failed at "${last}"`);
    },
  };
}
