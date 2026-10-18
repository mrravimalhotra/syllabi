"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readAnswerStream } from "@/lib/answer-stream";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import { findProblems, solve } from "@/lib/worked/detect";
import type { WorkedExample } from "@/lib/worked/types";
import type { GenerationTaskType } from "@/types/database";
import type { GenerationResult } from "@/app/dashboard/_ask/constants";

interface LastRequest {
  route: string;
  body: Record<string, unknown>;
  task: GenerationTaskType;
}

/**
 * Sending a question and showing what comes back: the answer streamed in as it
 * is written, the finished result, a calculation worked out by code, and the
 * messages for a stopped or failed request. `onFinished` runs after a request
 * ends with an answer (to refresh the usage bar).
 */
export function useGeneration(onFinished: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  // A calculation answered by code alone (no AI): its worked example, and its id once saved.
  const [worked, setWorked] = useState<{ example: WorkedExample; id: string | null } | null>(null);
  // Calculations found in the last question, offered as "See it worked out" under an AI answer.
  const [openWorked, setOpenWorked] = useState<number | null>(null);
  // The last request sent, kept for finding the calculations in the question just answered.
  const [lastBody, setLastBody] = useState<Record<string, unknown> | null>(null);
  // The answer as written so far (streamed), shown while it is still being made.
  const [draft, setDraft] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  // A ref, not state: two quick triggers (double click, Ctrl+Enter) in the same moment would both still see the old state.
  const busyRef = useRef(false);
  const draftRef = useRef("");
  const draftFrame = useRef<number | null>(null);
  const lastRequestRef = useRef<LastRequest | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Leaving the page while an answer is being written loses the wait (the answer is still saved): ask first.
  useEffect(() => {
    if (!loading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [loading]);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  /** Starts afresh: the messages and the last answer are cleared. */
  function clear() {
    setError(null);
    setNotice(null);
    setResult(null);
    setWorked(null);
    setOpenWorked(null);
  }

  /** A calculation answered by code alone: shown at once, then saved in the background so it appears in My Documents. */
  function showWorked(example: WorkedExample, problem: unknown) {
    clear();
    setWorked({ example, id: null });
    lastRequestRef.current = null;
    fetch("/api/worked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem }),
    })
      .then((r) => r.json())
      .then((data) => data?.id && setWorked((w) => (w && w.example === example ? { ...w, id: data.id } : w)))
      .catch(() => {});
  }

  /** Reads the response: a stream of text shown as it arrives, or a plain JSON answer. */
  async function readResponse(res: Response): Promise<GenerationResult> {
    if (res.ok && res.body && (res.headers.get("content-type") ?? "").includes("application/x-ndjson")) {
      return readAnswerStream<GenerationResult>(res.body, {
        onText: (delta) => {
          draftRef.current += delta;
          if (draftFrame.current === null) {
            draftFrame.current = requestAnimationFrame(() => {
              draftFrame.current = null;
              setDraft(draftRef.current);
            });
          }
        },
        onReset: () => {
          draftRef.current = "";
          setDraft("");
        },
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "make your answer"));
    return data;
  }

  /** Sends one request; also used by "Make a new answer", which resends the last one with fresh: true. Resolves to true when an answer came back. */
  async function send(route: string, body: Record<string, unknown>, task: GenerationTaskType): Promise<boolean> {
    busyRef.current = true;
    setLoading(true);
    clear();
    lastRequestRef.current = { route, body, task };
    setLastBody(body);
    draftRef.current = "";
    setDraft("");
    const controller = new AbortController();
    abortRef.current = controller;
    let answered = false;

    try {
      // Answers (not study packs) are streamed, so the first words show within seconds.
      const streaming = task !== "study_pack";
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(streaming ? { ...body, stream: true } : body),
      });
      const data = await readResponse(res);
      setLoading(false);
      setResult(data);
      answered = true;
      onFinished();
    } catch (err) {
      if (controller.signal.aborted) {
        setNotice("You stopped waiting. If the answer still finishes, it will appear in My Documents.");
      } else {
        setError(
          err instanceof TypeError
            ? OFFLINE_MESSAGE
            : err instanceof Error
              ? err.message
              : "Couldn't make your answer. Check your connection and try again."
        );
      }
    } finally {
      abortRef.current = null;
      busyRef.current = false;
      if (draftFrame.current !== null) cancelAnimationFrame(draftFrame.current);
      draftFrame.current = null;
      draftRef.current = "";
      setDraft("");
      setLoading(false);
    }
    return answered;
  }

  /** Sends the last question again for a fresh answer. Returns the kind it was (so the screen can show that kind), or null when there is nothing to resend. */
  function resend(): { task: GenerationTaskType; done: Promise<boolean> } | null {
    const last = lastRequestRef.current;
    if (!last || busyRef.current) return null;
    return { task: last.task, done: send(last.route, { ...last.body, fresh: true }, last.task) };
  }

  // Calculations in the question just answered, each with its worked example.
  const workedInQuestion = useMemo(() => {
    if (!result || !lastBody) return [];
    const text = [lastBody.prompt, lastBody.attachedText].filter((t) => typeof t === "string").join("\n");
    return findProblems(text, typeof lastBody.language === "string" ? lastBody.language : undefined)
      .slice(0, 6)
      .map((f) => solve(f.problem))
      .filter((e): e is WorkedExample => e !== null);
  }, [result, lastBody]);

  return {
    loading,
    error,
    notice,
    setError,
    setNotice,
    result,
    worked,
    openWorked,
    setOpenWorked,
    workedInQuestion,
    draft,
    resultRef,
    isBusy: () => busyRef.current,
    stop: () => abortRef.current?.abort(),
    clear,
    send,
    resend,
    showWorked,
  };
}
