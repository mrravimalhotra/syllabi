import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { SignUpForm } from "@/components/SignUpForm";
import { Alert, link } from "@/components/ui";
import { signupsOpen } from "@/lib/access";
import { SIGNUP_ERRORS, pick } from "@/lib/auth-messages";

export const metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const error = pick(SIGNUP_ERRORS, (await searchParams).error);

  return (
    <AuthShell
      title="Create your account"
      description="For parents and tutors (18+) preparing study material for their children or students. An admin approves each new account."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={link}>
            Sign in
          </Link>
        </>
      }
    >
      {!signupsOpen() && (
        <Alert tone="warning">Private testing: sign-ups are currently limited to the Syllabi team.</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <SignUpForm />
    </AuthShell>
  );
}
