"use client";

import { useRef, useState } from "react";
import { readAttachments } from "@/app/dashboard/_ask/attachments";
import { UploadIcon } from "@/components/icons";
import { Alert, Spinner, button, card, cx } from "@/components/ui";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";

/**
 * Adding class diary pages: a PDF or photos (taken with the camera on a phone). The pages are read on the
 * server and each period's classwork and homework is added to the list. A diary added twice is not doubled.
 */
export function AddDiary({ onAdded }: { onAdded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setResult(null);
    try {
      const read = await readAttachments(Array.from(files), []);
      if ("error" in read) throw new Error(read.error);
      if (read.longPdfs.length) throw new Error(`That PDF has ${read.longPdfs[0].total} pages. Add up to 12 diary pages at a time.`);
      if (read.photos.length === 0) throw new Error("Choose a PDF or photos of the class diary.");
      const res = await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: files[0].name, pages: read.photos.map((p) => ({ data: p.imageBase64, mimeType: p.mimeType, text: p.text })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "read the diary"));
      if (data.message) setResult({ tone: "info", text: data.message });
      else
        setResult({
          tone: "success",
          text:
            `Added ${data.added} ${data.added === 1 ? "entry" : "entries"} from the diary.` +
            (data.skipped ? ` ${data.skipped} ${data.skipped === 1 ? "was" : "were"} already in your list.` : ""),
        });
      onAdded();
    } catch (err) {
      setResult({ tone: "error", text: err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't read the diary." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className={cx(card, "space-y-3 p-4 sm:p-5")} aria-label="Add the class diary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900">Add the class diary</h2>
          <p className="text-sm text-slate-500">A PDF or photos of the day&apos;s diary page. Classwork and homework are added for each period.</p>
        </div>
        <button type="button" className={button.primary} onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Spinner /> : <UploadIcon className="h-4 w-4" />} {busy ? "Reading the diary..." : "Add diary pages"}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="hidden"
          aria-label="Class diary pages"
          onChange={(e) => void add(e.target.files)}
        />
      </div>
      {busy && <p className="text-xs text-slate-500">This takes about half a minute. Keep this page open.</p>}
      {result && <Alert tone={result.tone}>{result.text}</Alert>}
    </section>
  );
}
