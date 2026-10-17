"use client";

import { useEffect, useState } from "react";
import { Alert, PageHeader, PageSkeleton, card, cx } from "@/components/ui";
import type { Student } from "@/types/database";

type StudentWithUsage = Student & { monthly_usage: number };

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const studentsRes = await fetch("/api/admin/students");
    const studentsData = await studentsRes.json();

    if (studentsRes.ok) setStudents(studentsData.students);
    else setError(studentsData.error);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount is intentional here
    load();
  }, []);

  async function patch(id: string, updates: Partial<Student>) {
    setError(null);
    const res = await fetch("/api/admin/students", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...data.student } : s)));
  }

  if (loading) return <PageSkeleton rows={2} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Accounts" description="Parents and tutors. Each manages their own private books under My books." />
      {error && <Alert tone="error">{error}</Alert>}

      <div className={cx(card, "overflow-x-auto")}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Parent / tutor</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Usage / Quota</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{s.full_name ?? "—"}</p>
                  <p className="text-xs text-slate-500">{s.email}</p>
                  {s.account_type && <p className="text-xs capitalize text-slate-400">{s.account_type}</p>}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {s.active ? "Active" : "No access"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={s.role}
                    onChange={(e) => patch(s.id, { role: e.target.value as "student" | "admin" })}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="student">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-slate-700">
                    {s.monthly_usage.toLocaleString("en-IN")} / {s.token_quota.toLocaleString("en-IN")}
                  </p>
                  <input
                    type="number"
                    defaultValue={s.token_quota}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (value !== s.token_quota) patch(s.id, { token_quota: value });
                    }}
                    className="mt-1 w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => patch(s.id, { active: !s.active })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      s.active
                        ? "bg-red-50 text-red-700 hover:bg-red-100"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    {s.active ? "Revoke" : "Grant access"}
                  </button>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
