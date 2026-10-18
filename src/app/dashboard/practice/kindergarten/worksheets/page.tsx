"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, button, cx } from "@/components/ui";
import {
  BOARD_COLUMNS,
  PAD_PENALTY,
  SHEET_KINDS,
  SHEET_LABELS,
  makeBoardGame,
  makeFamilySheet,
  makeMatchSheet,
  type BoardCell,
  type SheetKind,
} from "@/lib/kindergarten/worksheets";
import { VOWELS, type Vowel } from "@/lib/kindergarten/words";
import { newSeed } from "@/lib/practice/random";

const TINTS = ["bg-pink-200", "bg-sky-200", "bg-emerald-200", "bg-amber-200", "bg-violet-200"];

/**
 * Printable kindergarten worksheets. The sheet fills a page; the controls
 * around it don't print. Use the browser's Print (Save as PDF works too).
 */
export default function KindergartenWorksheetsPage() {
  const [kind, setKind] = useState<SheetKind>("family");
  // The first sheet is chosen after the page loads, so the server and the browser never disagree about it.
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- choosing a random first sheet must wait until the page has loaded
    setSeed(newSeed());
  }, []);
  const [vowels, setVowels] = useState<Vowel[]>([...VOWELS]);

  const family = useMemo(() => (kind === "family" && seed !== null ? makeFamilySheet(seed, vowels) : null), [kind, seed, vowels]);
  const board = useMemo(() => (kind === "board" && seed !== null ? makeBoardGame(seed, vowels) : null), [kind, seed, vowels]);
  const match = useMemo(() => (kind === "match" && seed !== null ? makeMatchSheet(seed, vowels) : null), [kind, seed, vowels]);

  const toggle = (v: Vowel) =>
    setVowels((cur) =>
      cur.includes(v) ? (cur.length > 1 ? cur.filter((x) => x !== v) : cur) : VOWELS.filter((x) => x === v || cur.includes(x))
    );

  return (
    <div className="space-y-6">
      <div className="space-y-4 print:hidden">
        <PageHeader
          title="Kindergarten worksheets"
          description="Printable pages for writing practice. Choose a sheet, press Print, and make another whenever you like."
        />
        <Link href="/dashboard/practice/kindergarten" className="text-sm font-medium text-brand-700 hover:underline">
          ← Back to Kindergarten
        </Link>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of worksheet">
          {SHEET_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cx(
                "min-h-11 rounded-xl border-2 px-4 text-sm font-medium",
                kind === k ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700"
              )}
            >
              {SHEET_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Vowel sounds on the sheet">
          <span className="text-sm text-slate-500">Vowels:</span>
          {VOWELS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vowels.includes(v)}
              onClick={() => toggle(v)}
              className={cx(
                "min-h-10 min-w-10 rounded-full border-2 px-3 text-sm font-semibold",
                vowels.includes(v) ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-500"
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => window.print()} className={button.primary}>
            Print this sheet
          </button>
          <button type="button" onClick={() => setSeed(newSeed())} className={button.secondary}>
            Make another sheet
          </button>
        </div>
        <p className="text-xs text-slate-500">
          On an iPhone or iPad Home Screen app, open Syllabi in Safari to print, or use Share → Print.
        </p>
      </div>

      {seed !== null && (
        <article
          className={cx(
            "mx-auto rounded-3xl border-4 border-dashed border-pink-300 bg-white p-6 print:max-w-none print:border-pink-300 print:p-8",
            kind === "board" ? "max-w-3xl" : "max-w-2xl"
          )}
          aria-label="Worksheet"
        >
          {kind === "board" && <style>{"@media print { @page { size: landscape; } }"}</style>}
          <div className="mb-4 flex justify-between text-sm text-slate-700">
            <span>Name: ______________________</span>
            <span>Date: ______________</span>
          </div>
          <h2 className="mb-5 rounded-full bg-pink-100 px-4 py-2 text-center text-2xl font-bold text-slate-800">
            {SHEET_LABELS[kind]}
            {kind === "family" ? ":" : kind === "match" ? "." : ""}
          </h2>

          {family && (
            <ol className="space-y-3">
              {family.map((row, i) => (
                <li key={row.rime} className="flex items-center gap-3">
                  <span className="w-6 text-right text-sm font-semibold text-slate-500">{i + 1}.</span>
                  <span className={cx("rounded-lg px-3 py-1 text-2xl font-bold", TINTS[i % TINTS.length])}>-{row.rime}</span>
                  <span className="w-16 text-2xl font-semibold text-slate-800">{row.example}</span>
                  <span className="flex flex-1 gap-3" aria-hidden>
                    {[0, 1, 2].map((n) => (
                      <span key={n} className="flex-1 border-b-2 border-dashed border-slate-400 pt-6" />
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {match && (
            <ol className="space-y-2">
              {match.pictures.map((p, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-6 text-right text-sm font-semibold text-slate-500">{i + 1}.</span>
                  <span className="w-14 text-4xl leading-none" aria-label="Picture" role="img">
                    {p.emoji}
                  </span>
                  <span className="text-xl text-slate-500" aria-hidden>
                    ●
                  </span>
                  <span className="flex-1" />
                  <span className="text-xl text-slate-500" aria-hidden>
                    ●
                  </span>
                  <span className="w-24 text-2xl font-semibold text-slate-800">{match.words[i]}</span>
                </li>
              ))}
            </ol>
          )}

          {board && <Board cells={board} />}

          <p className="mt-5 text-center text-sm text-slate-500">You can do it! ❤️</p>
        </article>
      )}
    </div>
  );
}

/** The board game: cells in path order, shown in rows that snake back and forth so the path is easy to follow. */
function Board({ cells }: { cells: BoardCell[] }) {
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
