"use client";

import { useRef, useState } from "react";
import type { GenerationResult } from "@/app/dashboard/_ask/constants";
import { isNoQuestions } from "@/lib/generation/solve-parts";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import { AnswerCutError, readAnswerStream } from "@/lib/answer-stream";
import { recoverAnswer } from "@/app/dashboard/_ask/recover";

export interface SolvePartState {
  label: string;
  prompt: string;
  status: "waiting" | "working" | "done" | "empty" | "failed";
  /** The saved answer of a finished part. */
  id?: string;
  text?: string;
  error?: string;
  /** When the part came from the book's saved answer key: the date it was made. */
  reusedFrom?: string;
}

/**
 * Asks for one part as the main Ask screen does: streamed, so the server's pings keep the connection open while
 * the part is solved (a silent request of a minute or more can be cut by a router or network); a request that
 * never got through is sent once more; and when the connection drops after the server began, the part is picked
 * up from the server when it is saved.
 */
async function askPart(body: Record<string, unknown>, signal: AbortSignal): Promise<{ id?: string | null; text: string; reusedFrom?: string }> {
  const started = Date.now();
  const send = () => fetch("/api/generate/solution", { ...JSON_POST, signal, body: JSON.stringify({ ...body, stream: true }) });
  let res: Response;
  try {
    res = await send();
  } catch (err) {
    if (signal.aborted || !(err instanceof TypeError) || navigator.onLine === false) throw err;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    res = await send();
  }
  const runId = res.headers.get("X-Run-Id");
  try {
    if (res.ok && res.body && (res.headers.get("content-type") ?? "").includes("application/x-ndjson")) {
      return await readAnswerStream<{ id?: string | null; text: string }>(res.body, { onText: () => {}, onReset: () => {} });
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string | null; text?: string; error?: string; reusedFrom?: string };
    if (!res.ok || typeof data.text !== "string") throw new Error(data.error ?? failedRequestMessage(res.status, "solve this part"));
    return { id: data.id, text: data.text, reusedFrom: data.reusedFrom };
  } catch (err) {
    if (signal.aborted || !runId || !(err instanceof AnswerCutError || err instanceof TypeError)) throw err;
    const recovered = await recoverAnswer(runId, started, signal);
    if (recovered && recovered !== "failed") return { id: recovered.id, text: recovered.text };
    throw new Error("The connection dropped while this part was solved. Try it again.");
  }
}

/** Parts asked for at the same time. */
const AT_ONCE = 2;
const JSON_POST = { method: "POST", headers: { "Content-Type": "application/json" } } as const;

/**
 * "Solve all exercise questions", one part of the books at a time: the parts are listed (no AI), each is asked for
 * as its own short request (so none can run out of time), shown as it finishes, and at the end they are put
 * together as one saved answer. A part that fails can be tried again; what is done can be saved without it.
 */
export function useSolveAll(onDone: (result: GenerationResult) => void, onError: (message: string) => void) {
  const [parts, setParts] = useState<SolvePartState[] | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const partsRef = useRef<SolvePartState[]>([]);
  const request = useRef<{ bookIds: string[]; language: string; title: string; fresh?: boolean } | null>(null);
  // After the answers are put together: how many parts came from the saved answer key, so they can be solved again.
  const [lastRun, setLastRun] = useState<{ parts: SolvePartState[]; reused: number; from?: string } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const update = (index: number, patch: Partial<SolvePartState>) => {
    partsRef.current = partsRef.current.map((p, i) => (i === index ? { ...p, ...patch } : p));
    setParts(partsRef.current);
  };

  async function solve(index: number, signal: AbortSignal) {
    update(index, { status: "working", error: undefined });
    try {
      const { bookIds, language, fresh } = request.current!;
      // part: the answer is kept as the book's answer key for these pages, and reused next time (unless fresh).
      const data = await askPart({ prompt: partsRef.current[index].prompt, documentIds: bookIds, language, photos: [], attachedText: "", part: true, fresh }, signal);
      update(index, { status: isNoQuestions(data.text) ? "empty" : "done", id: data.id ?? undefined, text: data.text, reusedFrom: data.reusedFrom });
    } catch (err) {
      if (signal.aborted) return update(index, { status: "waiting" });
      update(index, { status: "failed", error: err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't solve this part." });
    }
  }

  /** Works through the waiting parts, a couple at a time; when every part is answered, they are put together. */
  async function run() {
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    const worker = async () => {
      for (;;) {
        const next = partsRef.current.findIndex((p) => p.status === "waiting");
        if (next === -1 || controller.signal.aborted) return;
        await solve(next, controller.signal);
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    setRunning(false);
    if (!controller.signal.aborted && partsRef.current.every((p) => p.status === "done" || p.status === "empty")) await save();
  }

  /** Puts the finished parts together as one saved answer. */
  async function save() {
    const finished = partsRef.current.filter((p) => p.id && (p.status === "done" || p.status === "empty"));
    setSaving(true);
    try {
      const res = await fetch("/api/documents/combine", { ...JSON_POST, body: JSON.stringify({ title: request.current?.title, parts: finished.map((p) => ({ id: p.id, label: p.label })) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "put the answers together"));
      const reused = finished.filter((p) => p.reusedFrom);
      setLastRun(reused.length ? { parts: partsRef.current, reused: reused.length, from: reused[0].reusedFrom } : null);
      partsRef.current = [];
      setParts(null);
      onDone(data as GenerationResult);
    } catch (err) {
      onError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't put the answers together.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Starts on the chosen books. Resolves to false when the books make only one part (or the parts couldn't be
   * listed): the caller then asks the usual way, in a single request.
   */
  async function start(bookIds: string[], language: string, title: string): Promise<boolean> {
    try {
      const res = await fetch("/api/generate/solution/parts", { ...JSON_POST, body: JSON.stringify({ documentIds: bookIds }) });
      const data = (await res.json().catch(() => ({}))) as { parts?: { label: string; prompt: string }[] };
      if (!res.ok || !Array.isArray(data.parts) || data.parts.length < 2) return false;
      request.current = { bookIds, language, title };
      setLastRun(null);
      partsRef.current = data.parts.map((p) => ({ ...p, status: "waiting" as const }));
      setParts(partsRef.current);
    } catch {
      return false;
    }
    void run();
    return true;
  }

  return {
    parts,
    running,
    saving,
    start,
    stop: () => abort.current?.abort(),
    /** Tries the failed (and stopped) parts again. */
    retry: () => {
      partsRef.current = partsRef.current.map((p) => (p.status === "failed" ? { ...p, status: "waiting" as const, error: undefined } : p));
      setParts(partsRef.current);
      void run();
    },
    save,
    lastRun,
    /** Solves every part afresh, instead of using the book's saved answer key. */
    solveAgain: () => {
      if (!lastRun || !request.current) return;
      request.current = { ...request.current, fresh: true };
      partsRef.current = lastRun.parts.map((p) => ({ label: p.label, prompt: p.prompt, status: "waiting" as const }));
      setParts(partsRef.current);
      setLastRun(null);
      void run();
    },
    /** Gives up on this run (finished parts stay in My Documents). */
    clear: () => {
      abort.current?.abort();
      partsRef.current = [];
      setParts(null);
    },
  };
}
