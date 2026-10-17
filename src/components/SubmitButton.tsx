"use client";

import { useFormStatus } from "react-dom";
import { Spinner, button, cx } from "@/components/ui";

/** A form's submit button that shows a spinner and blocks double-submits while the server action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} className={cx(button.primary, "w-full", className)}>
      {pending ? (
        <>
          <Spinner /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
