"use client";

import Link from "next/link";
import type { MeResponse } from "@/app/dashboard/_ask/constants";
import { Alert, Meter } from "@/components/ui";

interface Props {
  me: MeResponse | null;
  overQuota: boolean;
  /** The list of books couldn't be loaded. */
  booksFailed: boolean;
  /** The list of books loaded and it is empty. */
  noBooks: boolean;
  /** The greeting and usage bar (the home); a tool's screen shows only the notices. */
  greeting?: boolean;
}

/** The greeting, the monthly usage bar, and the notices above the question box. */
export function AskHeader({ me, overQuota, booksFailed, noBooks, greeting = true }: Props) {
  const firstName = me?.student.full_name?.split(" ")[0];
  return (
    <>
      {greeting && (
        <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {firstName ? `Hi ${firstName}, what shall we work on?` : "What shall we work on?"}
            </h1>
            <p className="text-sm text-slate-500">
              Choose what you need. Answers come from your uploaded books, are checked, and can be printed or saved as a PDF.
            </p>
          </div>
          {me && (
            <Link
              href="/dashboard/account"
              className="w-full max-w-56 space-y-1.5 rounded-xl px-1 py-1 text-xs text-slate-500 hover:text-slate-700 sm:w-56"
            >
              <span className="flex justify-between">
                <span>This month</span>
                <span className="tabular-nums">{Math.min(100, Math.round((me.quota.used / Math.max(me.quota.quota, 1)) * 100))}% used</span>
              </span>
              <Meter value={me.quota.used} max={me.quota.quota} label="Monthly usage" />
            </Link>
          )}
        </div>
      )}

      {overQuota && (
        <Alert tone="error" className="print:hidden">
          You&apos;ve used all of this month&apos;s allowance, so new answers are paused. It resets on the 1st. To get more now, ask the
          person who runs Syllabi for you to raise your limit (Admin → Accounts). Saved answers, worked examples and Practice still work.
        </Alert>
      )}
      {booksFailed && (
        <Alert tone="error" className="print:hidden">
          Couldn&apos;t load your books, so answers won&apos;t use them. Check your connection and reload the page.
        </Alert>
      )}
      {noBooks && (
        <Alert tone="info" className="print:hidden">
          Add your child&apos;s or student&apos;s books in{" "}
          <Link href="/dashboard/library" className="font-medium underline">
            My books
          </Link>{" "}
          so answers come from them. Until then, Syllabi answers from general knowledge.
        </Alert>
      )}
    </>
  );
}
