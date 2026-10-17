"use client";

import { useEffect } from "react";
import { AlertIcon } from "@/components/icons";
import { button, card, cx } from "@/components/ui";

/** Shown if a page in the app crashes, instead of a blank screen. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className={cx(card, "flex flex-col items-center px-6 py-12 text-center")}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <AlertIcon className="h-6 w-6" />
      </div>
      <p className="mt-4 text-base font-semibold text-slate-900">Something went wrong on this page</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Your books and saved answers are safe. Try again, or reload the page.
      </p>
      <button onClick={reset} className={cx(button.primary, "mt-5")}>
        Try again
      </button>
    </div>
  );
}
