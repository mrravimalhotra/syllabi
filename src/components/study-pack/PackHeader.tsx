"use client";

import { CheckIcon, CopyIcon, DownloadIcon, SpeakerIcon } from "@/components/icons";
import { PdfButton } from "@/components/PdfButton";
import { PrintButton } from "@/components/PrintButton";
import type { Speech } from "@/components/study-pack/useSpeech";
import { Badge, button, card, cx } from "@/components/ui";
import type { StudyPack } from "@/lib/study-pack/types";

interface Props {
  pack: StudyPack;
  pdfUrl: string | null;
  meta?: React.ReactNode;
  /** Buttons the page adds (such as Delete). */
  actions?: React.ReactNode;
  copied: boolean;
  onCopy: () => void;
  speech: Speech;
}

/** The top of a study pack: its name and source, copy / print / PDF buttons, the overview, themes and characters, and the read-aloud speed. */
export function PackHeader({ pack, pdfUrl, meta, actions, copied, onCopy, speech }: Props) {
  return (
    <header className={cx(card, "space-y-4 p-4 sm:p-6 print:hidden")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">Study pack</Badge>
            <Badge>{pack.kind === "story" ? "Story chapter" : "Information chapter"}</Badge>
            {pack.subject && <Badge>{pack.subject}</Badge>}
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere]">{pack.title}</h2>
          <p className="text-xs text-slate-500">
            From {pack.source}
            {meta ? <> · {meta}</> : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={onCopy} className={button.small}>
            {copied ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <CopyIcon className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <PrintButton pdfUrl={pdfUrl} name={pack.title} />
          {pdfUrl && (
            <PdfButton url={pdfUrl} name={pack.title} className={button.smallPrimary}>
              <DownloadIcon className="h-4 w-4" /> PDF
            </PdfButton>
          )}
          {/* Last, so the first button reached is never Delete. */}
          {actions}
        </div>
      </div>
      {pack.overview && <p className="text-[15px] leading-7 text-slate-700">{pack.overview}</p>}
      {(pack.themes.length > 0 || pack.characters.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {pack.themes.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {pack.kind === "story" ? "Themes" : "Big ideas"}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pack.themes.map((t) => (
                  <span key={t} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-800">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {pack.characters.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Characters</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {pack.characters.map((c) => (
                  <li key={c.name} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700" title={c.role}>
                    <span className="font-medium text-slate-900">{c.name}</span> · {c.role}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {speech.supported && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <SpeakerIcon className="h-4 w-4" />
          Read-aloud speed
          <select
            value={speech.rate}
            onChange={(e) => speech.setRate(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs"
            aria-label="Read-aloud speed"
          >
            <option value={0.8}>Slow</option>
            <option value={0.95}>Normal</option>
            <option value={1.1}>Fast</option>
          </select>
        </div>
      )}
      {speech.notice && (
        <p role="status" className="text-xs text-amber-700">
          {speech.notice}
        </p>
      )}
    </header>
  );
}
