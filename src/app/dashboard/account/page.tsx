"use client";

import { failedRequestMessage } from "@/lib/http-errors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EditableName } from "@/components/EditableName";
import { CheckIcon } from "@/components/icons";
import { BOARDS, CLASS_LEVELS } from "@/lib/generation/level";
import { LANGUAGE_NAMES } from "@/lib/generation/language";
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
    if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "save your name"));
    setMe((prev) => (prev ? { ...prev, student: { ...prev.student, full_name: data.fullName } } : prev));
  }

  // Class and board shape every answer ("write for a Class 6 CBSE student").
  async function saveLevel(change: { classLevel?: string; board?: string; answerLanguage?: string }) {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "save that change"));
    setMe((prev) =>
      prev
        ? {
            ...prev,
            student: {
              ...prev.student,
              ...(change.classLevel !== undefined ? { class_level: change.classLevel || null } : {}),
              ...(change.board !== undefined ? { board: change.board || null } : {}),
              ...(change.answerLanguage !== undefined
                ? { answer_language: change.answerLanguage === "auto" ? null : (change.answerLanguage as Student["answer_language"]) }
                : {}),
            },
          }
        : prev
    );
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
      setError(data.error ?? failedRequestMessage(res.status, "delete your account"));
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
      <PageHeader
        title="Account"
        description="Your name and email, the class and board your answers are written for, the answer language, this month's usage, and your password."
      />

      <section className={cx(card, "divide-y divide-slate-100")}>
        <Row label="Name">
          <EditableName value={student.full_name ?? ""} emptyText="Not set: tap the pencil to add your name" onSave={rename} className="text-slate-900" />
        </Row>
        <Row label="Email">
          <span className="break-all text-slate-900">{student.email}</span>
        </Row>
        {student.account_type && (
          <Row label="Account type">
            <span className="text-slate-900 capitalize">{student.account_type}</span>
          </Row>
        )}
        <Row label={student.account_type === "tutor" ? "Student's class" : "Child's class"}>
          <LevelSelect
            label={student.account_type === "tutor" ? "Student's class" : "Child's class"}
            value={student.class_level ?? ""}
            options={CLASS_LEVELS.map((c) => ({ value: c, label: c }))}
            onSave={(v) => saveLevel({ classLevel: v })}
          />
        </Row>
        <Row label="School board">
          <LevelSelect label="School board" value={student.board ?? ""} options={BOARDS.map((b) => ({ value: b, label: b }))} onSave={(v) => saveLevel({ board: v })} />
        </Row>
        <Row label="Answer language">
          <LevelSelect
            label="Answer language"
            value={student.answer_language ?? "auto"}
            emptyLabel={null}
            options={[
              { value: "auto", label: "Same as the book" },
              ...(["en", "hi", "mr", "fr"] as const).map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
            ]}
            onSave={(v) => saveLevel({ answerLanguage: v })}
          />
        </Row>
        <Row label="This month">
          <div className="w-full max-w-xs space-y-1.5">
            <Meter value={quota.used} max={quota.quota} label="Monthly usage" />
            <p className="text-xs text-slate-500 tabular-nums">
              {Math.min(100, Math.round((quota.used / Math.max(quota.quota, 1)) * 100))}% of this month&apos;s allowance used. It resets on the 1st.
              <span className="block text-slate-400">
                ({quota.used.toLocaleString("en-IN")} of {quota.quota.toLocaleString("en-IN")} AI tokens)
              </span>
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

/** A select that saves as soon as it changes, with a small "Saved" confirmation. */
function LevelSelect({
  label,
  value,
  options,
  emptyLabel = "Not set",
  onSave,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  /** Label for the empty choice; null offers no empty choice. */
  emptyLabel?: string | null;
  onSave: (value: string) => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={label}
        value={value}
        disabled={state === "saving"}
        onChange={async (e) => {
          setState("saving");
          try {
            await onSave(e.target.value);
            setState("saved");
          } catch {
            setState("error");
          }
        }}
        className={cx(input, "w-auto min-w-40")}
      >
        {emptyLabel !== null && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {state === "saving" && <Spinner />}
      <span role="status" className="contents">
        {state === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckIcon className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {state === "error" && <span className="text-xs text-red-600">Couldn&apos;t save. Check your connection and choose again.</span>}
      </span>
    </div>
  );
}
