"use client";

import { Alert, button, cx } from "@/components/ui";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Alert tone="error">
      <p className="font-medium">Something went wrong loading this admin page.</p>
      <p className="mt-1 text-xs">{error.message}</p>
      <button onClick={reset} className={cx(button.danger, "mt-3")}>
        Try again
      </button>
    </Alert>
  );
}
