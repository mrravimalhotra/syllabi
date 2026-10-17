import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/auth";
import { AuthShell } from "@/components/AuthShell";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, input, link } from "@/components/ui";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your account email and we'll send you a link to choose a new password."
      footer={
        <Link href="/login" className={link}>
          Back to sign in
        </Link>
      }
    >
      <form action={requestPasswordReset} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className={input} />
        </Field>
        <SubmitButton pendingLabel="Sending...">Send reset link</SubmitButton>
      </form>
    </AuthShell>
  );
}
