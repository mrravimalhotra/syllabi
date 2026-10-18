"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Field, Spinner, button, cx, input } from "@/components/ui";
import { failedRequestMessage } from "@/lib/http-errors";

/** "Delete my account": the person types DELETE to confirm, then everything is removed and they are signed out. */
export function DeleteAccount() {
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: confirmText }),
    });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      setError(data.error ?? failedRequestMessage(res.status, "delete your account"));
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-red-200 bg-white p-5 shadow-xs sm:p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-red-700">Delete my account</h2>
        <p className="text-sm text-slate-600">
          This permanently deletes your account, your books and their page images, and every saved answer. It can&apos;t be undone.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Type DELETE to confirm" htmlFor="confirm-delete">
          <input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className={cx(input, "sm:w-56")}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </Field>
        <button type="button" onClick={deleteAccount} disabled={confirmText !== "DELETE" || deleting} className={button.danger}>
          {deleting && <Spinner />}
          {deleting ? "Deleting..." : "Delete my account"}
        </button>
      </div>
    </section>
  );
}
