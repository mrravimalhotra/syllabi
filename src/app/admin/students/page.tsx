"use client";

import { useEffect, useState } from "react";
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

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Accounts</h1>
      <p className="text-sm text-slate-500">Parents and tutors. Each manages their own private books under My books.</p>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
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
                    {s.active ? "Active" : "Pending/Revoked"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={s.role}
                    onChange={(e) => patch(s.id, { role: e.target.value as "student" | "admin" })}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="student">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-slate-700">
                    {s.monthly_usage.toLocaleString()} / {s.token_quota.toLocaleString()}
                  </p>
                  <input
                    type="number"
                    defaultValue={s.token_quota}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (value !== s.token_quota) patch(s.id, { token_quota: value });
                    }}
                    className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => patch(s.id, { active: !s.active })}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
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
