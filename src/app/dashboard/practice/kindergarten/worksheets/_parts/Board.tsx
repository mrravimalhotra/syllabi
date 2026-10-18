"use client";

import { cx } from "@/components/ui";
import { BOARD_COLUMNS, PAD_PENALTY, type BoardCell } from "@/lib/kindergarten/worksheets";

/** The board game: cells in path order, shown in rows that snake back and forth so the path is easy to follow. */
export function Board({ cells }: { cells: BoardCell[] }) {
  const rows: { cell: BoardCell; step: number }[][] = [];
  cells.forEach((cell, step) => {
    const row = Math.floor(step / BOARD_COLUMNS);
    (rows[row] ??= []).push({ cell, step });
  });
  return (
    <div>
      <p className="mb-4 text-center text-sm text-slate-600">
        Roll a die and hop that many spaces. Read the word you land on. If you read it right, hop ahead 1 space. If you land on a lily pad,
        hop back {PAD_PENALTY}. First frog to the pond wins!
      </p>
      <div className="space-y-2" aria-label="Board">
        {rows.map((row, r) => (
          <div
            key={r}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${BOARD_COLUMNS}, minmax(0, 1fr))`, direction: r % 2 === 1 ? "rtl" : "ltr" }}
          >
            {row.map(({ cell, step }) => (
              <div
                key={step}
                style={{ direction: "ltr" }}
                className={cx(
                  "relative flex aspect-[5/3] items-center justify-center rounded-full border-2 text-center text-xl font-semibold",
                  cell.kind === "word" && "border-slate-700 bg-white text-slate-900",
                  cell.kind === "pad" && "border-emerald-600 bg-emerald-200 text-2xl",
                  cell.kind === "start" && "border-amber-500 bg-amber-100 text-sm font-bold",
                  cell.kind === "pond" && "border-sky-600 bg-sky-200 text-sm font-bold"
                )}
              >
                {cell.kind === "word" && cell.word}
                {cell.kind === "pad" && <span aria-label="Lily pad">🌿</span>}
                {cell.kind === "start" && <span>🐸 START</span>}
                {cell.kind === "pond" && <span>🏞️ POND</span>}
                <span className="absolute top-0.5 left-2.5 text-[9px] font-normal text-slate-400">{step}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
