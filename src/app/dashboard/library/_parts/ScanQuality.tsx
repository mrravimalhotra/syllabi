"use client";

import { Badge } from "@/components/ui";
import type { BookScan } from "@/lib/ingestion/confidence";

const TONE = { high: "success", medium: "warning", low: "danger" } as const;
const WORD = { high: "High", medium: "Medium", low: "Low" } as const;

/** How sure the app is that every page of the book was read completely, and what to do when it is not. Nothing for a book scored before this existed. */
export function ScanQuality({ scan }: { scan: BookScan | null }) {
  if (!scan) return null;
  const why = scan.problems.length > 0 ? `Seen on some pages: ${scan.problems.join("; ")}.` : undefined;
  return (
    <div className="space-y-1" data-testid="scan-quality">
      <span title={why}>
        <Badge tone={TONE[scan.level]}>
          Scan quality: {WORD[scan.level]} ({scan.score}%)
        </Badge>
      </span>
      {scan.advice && (
        <p className={scan.level === "low" ? "text-xs text-red-700" : "text-xs text-amber-800"}>
          {scan.advice}
          {why && <span className="text-slate-500"> {why}</span>}
        </p>
      )}
    </div>
  );
}
