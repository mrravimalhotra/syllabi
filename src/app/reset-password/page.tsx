import Link from "next/link";
import { updatePassword } from "@/lib/actions/auth";
import { AuthShell } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert } from "@/components/ui";
import { RESET_ERRORS, pick } from "@/lib/auth-messages";

export const metadata = { title: "New password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = pick(RESET_ERRORS, (await searchParams).error);

  return (
    <AuthShell title="Choose a new password" description="At least 8 characters.">
      {error && (
        <Alert tone="error">
          {error}{" "}
          {error === RESET_ERRORS["no-session"] && (
            <Link href="/forgot-password" className="font-medium underline">
              Send a new link
            </Link>
          )}
        </Alert>
      )}
      <form action={updatePassword} className="space-y-4">
        <PasswordInput name="password" label="New password" autoComplete="new-password" minLength={8} required />
        <PasswordInput name="confirm_password" label="Confirm new password" autoComplete="new-password" minLength={8} required />
        <SubmitButton pendingLabel="Saving...">Save new password</SubmitButton>
      </form>
    </AuthShell>
  );
}
