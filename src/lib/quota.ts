import { createAdminClient } from "@/lib/supabase/admin";
import { UserError } from "@/lib/errors";

export interface QuotaStatus {
  used: number;
  quota: number;
  remaining: number;
  overQuota: boolean;
}

/** Checks a student's current-month token usage against their configured quota. */
export async function checkQuota(studentId: string): Promise<QuotaStatus> {
  const admin = createAdminClient();

  const [{ data: usedData, error: usedError }, { data: student, error: studentError }] = await Promise.all([
    admin.rpc("student_monthly_usage", { p_student_id: studentId }),
    admin.from("students").select("token_quota").eq("id", studentId).single(),
  ]);

  if (usedError) throw new Error(`Failed to read usage: ${usedError.message}`);
  if (studentError || !student) throw new Error(`Account not found: ${studentError?.message ?? "no row"}`);

  const used = (usedData as number) ?? 0;
  const quota = student.token_quota;

  return { used, quota, remaining: Math.max(quota - used, 0), overQuota: used >= quota };
}

/** Thrown when an account has used all of its monthly allowance; becomes a 429 with this message. */
export class QuotaExceededError extends UserError {
  status: QuotaStatus;
  constructor(status: QuotaStatus) {
    super(
      "You've used all of this month's allowance, so new answers are paused. It resets on the 1st. " +
        "To get more now, ask the person who runs Syllabi for you to raise your limit."
    );
    this.status = status;
  }
}
