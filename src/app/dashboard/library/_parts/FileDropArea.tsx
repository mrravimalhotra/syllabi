"use client";

import { useState } from "react";
import { MAX_PAGES } from "@/app/dashboard/library/_parts/upload-helpers";
import { UploadIcon } from "@/components/icons";
import { Spinner, cx } from "@/components/ui";

/** The dashed box where files are dropped or chosen. */
export function FileDropArea({
  busy,
  preparing,
  onFiles,
}: {
  busy: boolean;
  preparing: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(e.dataTransfer.files);
      }}
      className={cx(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition",
        dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40",
        busy && "pointer-events-none opacity-60"
      )}
    >
      <input
        type="file"
        accept="image/*,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
        disabled={busy}
        className="sr-only"
      />
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-xs ring-1 ring-slate-200">
        {preparing ? <Spinner className="h-5 w-5" /> : <UploadIcon className="h-5 w-5" />}
      </span>
      <span className="mt-3 text-sm font-medium text-slate-900">
        {preparing ? (
          "Preparing pages..."
        ) : (
          <>
            <span className="text-brand-700">Choose files</span>
            <span className="hidden sm:inline"> or drag them here</span>
          </>
        )}
      </span>
      <span className="mt-1 text-xs text-slate-500">
        Photos, PDF or Word (.docx), up to {MAX_PAGES} pages. Large photos are shrunk automatically, like in WhatsApp.
      </span>
    </label>
  );
}
