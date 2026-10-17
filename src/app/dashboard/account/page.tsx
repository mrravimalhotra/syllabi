"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EditableName } from "@/components/EditableName";
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
    return error ? (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    ) : (
      <p className="text-sm text-slate-500">Loading...</p>
    );
  }

  const { student, quota } = me;
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Account</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:p-5">
        <div>
          <p className="text-xs font-medium text-slate-500">Name</p>
          <EditableName value={student.full_name ?? "Add your name"} onSave={rename} className="text-slate-900" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Email</p>
          <p className="text-slate-900">{student.email}</p>
        </div>
        {student.account_type && (
          <div>
            <p className="text-xs font-medium text-slate-500">Account type</p>
            <p className="capitalize text-slate-900">{student.account_type}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-slate-500">This month&apos;s usage</p>
          <p className="text-slate-900">
            {quota.used.toLocaleString()} of {quota.quota.toLocaleString()} tokens
          </p>
        </div>
        <Link href="/reset-password" className="inline-block text-sm font-medium text-slate-900 underline">
          Change password
        </Link>
      </section>

      <section className="space-y-3 rounded-xl border border-red-200 bg-white p-4 text-sm sm:p-5">
        <h2 className="font-semibold text-red-700">Delete my account</h2>
        <p className="text-slate-600">
          This permanently deletes your account, your books and their page images, and every saved answer. It can&apos;t
          be undone.
        </p>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <label className="block text-slate-700">
          Type <strong>DELETE</strong> to confirm
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-1 block w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={deleteAccount}
          disabled={confirmText !== "DELETE" || deleting}
          className="min-h-11 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 sm:min-h-0"
        >
          {deleting ? "Deleting..." : "Delete my account"}
        </button>
      </section>
    </div>
  );
}
