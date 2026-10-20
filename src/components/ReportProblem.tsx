"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BugIcon, XIcon } from "@/components/icons";
import { ReportForm, type MyReport } from "@/components/ReportForm";
import { Alert, button } from "@/components/ui";
import { installCapture, notePage, takeSnapshot, type Snapshot } from "@/lib/debug/capture";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

/**
 * A "Report a problem" button on every screen. It keeps a short memory of what the screen did (clicks, requests
 * with what was sent and received, errors) and, when the person describes the problem, sends that as a ticket so
 * it can be found and fixed. The person sees exactly what will be sent before sending.
 */
export function ReportProblem() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [includeScreen, setIncludeScreen] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [mine, setMine] = useState<MyReport[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    installCapture();
  }, []);
  useEffect(() => {
    notePage(pathname);
  }, [pathname]);

  // A fresh record each time the box opens (and whenever "include what is on my screen" is switched).
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the record is read from the browser when the box opens
    setSnapshot(takeSnapshot(includeScreen));
  }, [open, includeScreen]);

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    fetch("/api/bug-reports")
      .then((res) => (res.ok ? res.json() : { reports: [] }))
      .then((data) => setMine((data.reports ?? []).slice(0, 5)))
      .catch(() => {});
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Write a short title first: what went wrong, in a few words.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          path: window.location.pathname,
          build: process.env.NEXT_PUBLIC_BUILD_ID ?? "",
          context: takeSnapshot(includeScreen),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't send the report. Try again.");
      setSent(data.number);
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't send the report. Try again.");
    } finally {
      setSending(false);
    }
  }

  function close() {
    setOpen(false);
    setSent(null);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 bottom-24 z-40 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-600 shadow-md backdrop-blur hover:text-slate-900 md:right-6 md:bottom-6 print:hidden"
        aria-label="Report a problem"
      >
        <BugIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Report a problem</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4 print:hidden"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Report a problem"
            className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">Report a problem</h2>
              <button type="button" onClick={close} className={button.icon} aria-label="Close">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {sent !== null ? (
              <div className="space-y-4 overflow-y-auto p-5">
                <Alert tone="success">
                  <span className="font-medium">Report #{sent} sent.</span> Thank you. It carries what the screen did just before, so it can
                  be found and fixed.
                </Alert>
                <button type="button" onClick={close} className={button.primary}>
                  Done
                </button>
              </div>
            ) : (
              <ReportForm
                title={title}
                description={description}
                includeScreen={includeScreen}
                snapshot={snapshot}
                sending={sending}
                error={error}
                mine={mine}
                titleRef={titleRef}
                onTitle={setTitle}
                onDescription={setDescription}
                onIncludeScreen={setIncludeScreen}
                onSend={send}
                onCancel={close}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
