"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Board } from "@/app/dashboard/practice/kindergarten/worksheets/_parts/Board";
import { FamilySheet } from "@/app/dashboard/practice/kindergarten/worksheets/_parts/FamilySheet";
import { MatchSheet } from "@/app/dashboard/practice/kindergarten/worksheets/_parts/MatchSheet";
import { PageHeader, button, cx } from "@/components/ui";
import {
  SHEET_KINDS,
  SHEET_LABELS,
  makeBoardGame,
  makeFamilySheet,
  makeMatchSheet,
  schoolFamilySheet,
  schoolMatchSheet,
  type SheetKind,
} from "@/lib/kindergarten/worksheets";
import { VOWELS, type Vowel } from "@/lib/kindergarten/words";
import { newSeed } from "@/lib/practice/random";

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
  const [school, setSchool] = useState(false);
  const [vowels, setVowels] = useState<Vowel[]>([...VOWELS]);

  const family = useMemo(
    () => (kind === "family" && seed !== null ? (school ? schoolFamilySheet() : makeFamilySheet(seed, vowels)) : null),
    [kind, seed, vowels, school]
  );
  const board = useMemo(() => (kind === "board" && seed !== null ? makeBoardGame(seed, vowels) : null), [kind, seed, vowels]);
  const match = useMemo(
    () => (kind === "match" && seed !== null ? (school ? schoolMatchSheet() : makeMatchSheet(seed, vowels)) : null),
    [kind, seed, vowels, school]
  );

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
        {kind !== "board" && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={school} onChange={(e) => setSchool(e.target.checked)} className="h-5 w-5" />
            Same words as the school&apos;s sheet
          </label>
        )}
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

          {family && <FamilySheet rows={family} />}

          {match && <MatchSheet sheet={match} />}

          {board && <Board cells={board} />}

          <p className="mt-5 text-center text-sm text-slate-500">You can do it! ❤️</p>
        </article>
      )}
    </div>
  );
}
