"use client";

import type { DownscaledImage } from "@/lib/downscale-image";
import { Thumb } from "@/app/dashboard/_ask/Parts";
import { DocumentIcon, XIcon } from "@/components/icons";
import { Spinner, button } from "@/components/ui";

interface Props {
  photos: DownscaledImage[];
  docs: { name: string; text: string }[];
  /** Files are being read right now. */
  reading: boolean;
  onRemovePhoto: (index: number) => void;
  onRemoveDoc: (index: number) => void;
}

/** The photos and Word files attached to the question, each with a remove button. */
export function AttachmentList({ photos, docs, reading, onRemovePhoto, onRemoveDoc }: Props) {
  if (photos.length === 0 && docs.length === 0 && !reading) return null;
  return (
    <ul className="flex flex-wrap gap-3 px-4 pb-3 sm:px-5" aria-label="Attachments">
      {photos.map((p, i) => (
        <li key={i} className="relative">
          <Thumb image={p} alt={`Attached page ${i + 1}`} />
          <button
            type="button"
            onClick={() => onRemovePhoto(i)}
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow ring-2 ring-white"
            aria-label={`Remove page ${i + 1}`}
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
      {docs.map((d, i) => (
        <li
          key={d.name + i}
          className="flex h-16 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 pr-1 pl-3 text-xs text-slate-700"
        >
          <DocumentIcon className="h-4.5 w-4.5 text-brand-600" />
          <span className="max-w-40 truncate">{d.name}</span>
          <button type="button" onClick={() => onRemoveDoc(i)} className={button.icon} aria-label={`Remove ${d.name}`}>
            <XIcon className="h-4 w-4" />
          </button>
        </li>
      ))}
      {reading && (
        <li className="flex h-16 items-center gap-2 px-2 text-xs text-slate-500">
          <Spinner /> Reading files...
        </li>
      )}
    </ul>
  );
}
