"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EditableName } from "@/components/EditableName";
import { Alert, Field, Meter, PageHeader, PageSkeleton, Spinner, button, card, cx, input } from "@/components/ui";
import type { Student } from "@/types/database";

interface Me {
  student: Student;
  quota: { used: number; quota: number };
}

/** The signed-in person's own account: name, password, usage, and deleting the account. */
export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setMe(data);
      })
      .catch(() => setError("Couldn't load your account. Reload the page to try again."));
  }, []);

  async function rename(fullName: string) {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Couldn't save your name");
    setMe((prev) => (prev ? { ...prev, student: { ...prev.student, full_name: data.fullName } } : prev));
  }

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
      setError(data.error ?? "Couldn't delete your account. Please try again.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  if (!me) {
    return error ? <Alert tone="error">{error}</Alert> : <PageSkeleton rows={2} />;
  }

  const { student, quota } = me;
  return (
    <div className="space-y-6">
      <PageHeader title="Account" description="Your details, usage and password." />

      <section className={cx(card, "divide-y divide-slate-100")}>
        <Row label="Name">
          <EditableName value={student.full_name ?? "Add your name"} onSave={rename} className="text-slate-900" />
        </Row>
        <Row label="Email">
          <span className="break-all text-slate-900">{student.email}</span>
        </Row>
        {student.account_type && (
          <Row label="Account type">
            <span className="text-slate-900 capitalize">{student.account_type}</span>
          </Row>
        )}
        <Row label="This month">
          <div className="w-full max-w-xs space-y-1.5">
            <Meter value={quota.used} max={quota.quota} label="Monthly usage" />
            <p className="text-xs text-slate-500 tabular-nums">
              {quota.used.toLocaleString("en-IN")} of {quota.quota.toLocaleString("en-IN")} tokens. Resets on the 1st.
            </p>
          </div>
        </Row>
        <Row label="Password">
          <Link href="/reset-password" className={button.secondary}>
            Change password
          </Link>
        </Row>
      </section>

      <section className="space-y-4 rounded-2xl border border-red-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-red-700">Delete my account</h2>
          <p className="text-sm text-slate-600">
            This permanently deletes your account, your books and their page images, and every saved answer. It
            can&apos;t be undone.
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
          <button
            type="button"
            onClick={deleteAccount}
            disabled={confirmText !== "DELETE" || deleting}
            className={button.danger}
          >
            {deleting && <Spinner />}
            {deleting ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4 text-sm sm:flex-row sm:items-center sm:gap-6 sm:px-6">
      <p className="w-36 shrink-0 text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}
