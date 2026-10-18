"use client";

import { button, cx } from "@/components/ui";

export interface MadeGuest {
  who: string;
  password: string | null;
  until: string;
}

/** Shown after a guest login is made: the details to hand over, and a Copy button. The password appears only this once. */
export function GuestMade({ made }: { made: MadeGuest }) {
  return (
    <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="font-medium">
        {made.password
          ? "Guest login ready. Copy it now: the password is shown only once."
          : "Guest login ready. The guest signs in with this user ID and the password you chose."}
      </p>
      <p className="mt-1">
        {made.password ? "Email" : "User ID"}: <span className="font-mono">{made.who}</span>
      </p>
      {made.password && (
        <p>
          Password: <span className="font-mono">{made.password}</span>
        </p>
      )}
      <p className="text-xs">
        Stops working on {new Date(made.until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
      </p>
      <button
        type="button"
        className={cx(button.small, "mt-2")}
        onClick={() =>
          void navigator.clipboard?.writeText(
            `${made.password ? "Email" : "User ID"}: ${made.who}${made.password ? `\nPassword: ${made.password}` : ""}`,
          )
        }
      >
        {made.password ? "Copy email and password" : "Copy user ID"}
      </button>
    </div>
  );
}
