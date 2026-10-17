"use client";

import { Alert, button, cx } from "@/components/ui";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Alert tone="error">
      <p className="font-medium">This admin page couldn&apos;t load.</p>
      <p className="mt-1 text-sm">Press Try again. If it keeps failing, open Admin → Health to see which service is down.</p>
      <p className="mt-1 text-xs break-words opacity-80">Details: {error.message}</p>
      <button type="button" onClick={reset} className={cx(button.danger, "mt-3")}>
        Try again
      </button>
    </Alert>
  );
}
