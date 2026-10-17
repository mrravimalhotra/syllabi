"use client";

import { useEffect } from "react";

/** Shown if a page in the app crashes, instead of a blank screen. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5">
      <p className="text-sm font-medium text-red-700">Something went wrong on this page.</p>
      <p className="mt-1 text-xs text-red-600">Your books and saved answers are safe. Try again, or reload the page.</p>
      <button onClick={reset} className="mt-3 min-h-11 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white sm:min-h-0">
        Try again
      </button>
    </div>
  );
}
