"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";

/**
 * True in Syllabi opened from the iPhone/iPad home screen. There, a PDF
 * opened as a page takes over the app with no way back, and the page's own
 * print command is ignored; so PDFs go to the iPhone's share sheet instead
 * (Print, Save to Files, WhatsApp...), which returns to the app when closed.
 */
export function inIosHomeScreenApp(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type State = { kind: "idle" } | { kind: "preparing" } | { kind: "ready"; file: File };

/**
 * Opens a PDF: in a new tab normally; in the iPhone home-screen app, through
 * the share sheet. Making a PDF can take a few seconds, and iOS only opens the
 * share sheet straight after a tap, so if it refuses, the button asks for one
 * more tap ("Tap to share") with the PDF ready.
 */
export function usePdfOpener(name: string) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const share = async (file: File) => {
    try {
      await navigator.share({ files: [file], title: name });
      setState({ kind: "idle" });
    } catch (err) {
      const reason = err instanceof Error ? err.name : "";
      if (reason === "NotAllowedError") setState({ kind: "ready", file });
      else setState({ kind: "idle" }); // cancelled, or nothing to do
    }
  };

  const open = async (url: string) => {
    if (!inIosHomeScreenApp()) {
      window.open(url, "_blank", "noopener");
      return;
    }
    if (state.kind === "ready") return share(state.file);
    if (state.kind === "preparing") return;
    setState({ kind: "preparing" });
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't make the PDF.");
      const file = new File([await res.blob()], `${name.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Syllabi"}.pdf`, { type: "application/pdf" });
      if (!navigator.canShare?.({ files: [file] })) {
        setState({ kind: "idle" });
        window.alert("This phone can't share files from the app. Open Syllabi in Safari to print or save PDFs.");
        return;
      }
      await share(file);
    } catch (err) {
      setState({ kind: "idle" });
      window.alert(err instanceof Error ? err.message : "Couldn't make the PDF. Please try again.");
    }
  };

  return { open, state: state.kind };
}

/** A button that opens a PDF (see usePdfOpener); shows progress while the PDF is made. */
export function PdfButton({
  url,
  name,
  className,
  children,
  label,
}: {
  url: string;
  name: string;
  className: string;
  children: React.ReactNode;
  /** Accessible name, for icon-only buttons. */
  label?: string;
}) {
  const pdf = usePdfOpener(name);
  return (
    <button type="button" onClick={() => pdf.open(url)} className={className} aria-label={label} title={label} disabled={pdf.state === "preparing"}>
      {pdf.state === "preparing" ? <Spinner className="h-4 w-4" /> : null}
      {pdf.state === "ready" ? "Tap to share" : children}
    </button>
  );
}
