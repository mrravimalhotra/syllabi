"use client";

import { failedRequestMessage } from "@/lib/http-errors";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DeleteAccount } from "@/app/dashboard/account/_parts/DeleteAccount";
import { LevelSelect } from "@/app/dashboard/account/_parts/LevelSelect";
import { Row } from "@/app/dashboard/account/_parts/Row";
import { EditableName } from "@/components/EditableName";
import { BOARDS, CLASS_LEVELS } from "@/lib/generation/level";
import { LANGUAGE_NAMES } from "@/lib/generation/language";
import { Alert, Meter, PageHeader, PageSkeleton, button, card, cx } from "@/components/ui";
import type { Student } from "@/types/database";

interface Me {
  student: Student;
  quota: { used: number; quota: number };
}

/** The signed-in person's own account: name, password, usage, and deleting the account. */
export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      <DeleteAccount />
    </div>
  );
}
