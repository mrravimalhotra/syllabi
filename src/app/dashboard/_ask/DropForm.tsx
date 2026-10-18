"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

/** The question form: files dropped anywhere on it are attached, and it lights up while they are over it. */
export function DropForm({
  onSubmit,
  onFiles,
  children,
}: {
  onSubmit: (e: React.FormEvent) => void;
  onFiles: (files: FileList) => void;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <form
      onSubmit={onSubmit}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(e.dataTransfer.files);
      }}
      className={cx(
        "relative rounded-2xl border bg-white shadow-xs transition print:hidden",
        dragging ? "border-brand-500 ring-4 ring-brand-100" : "border-slate-200 focus-within:border-slate-300 focus-within:shadow-sm",
      )}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-brand-50/90 text-sm font-medium text-brand-700">
          Drop photos, a PDF or a Word file to attach
        </div>
      )}
      {children}
    </form>
  );
}
