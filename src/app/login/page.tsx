import Link from "next/link";
import { signIn } from "@/lib/actions/auth";
import { AuthShell } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field, input, link } from "@/components/ui";
import { LOGIN_ERRORS, LOGIN_MESSAGES, pick, safeNext } from "@/lib/auth-messages";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const message = pick(LOGIN_MESSAGES, params.message);
  const error = pick(LOGIN_ERRORS, params.error);
  const next = safeNext(params.next);

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your study material and saved answers."
      footer={
        <>
          New to Syllabi?{" "}
          <Link href="/signup" className={link}>
            Create an account
          </Link>
        </>
      }
    >
      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className={input} />
        </Field>
        <div className="space-y-1.5">
          <PasswordInput name="password" label="Password" autoComplete="current-password" required />
          <p className="text-right text-xs">
            <Link href="/forgot-password" className={link}>
              Forgot password?
            </Link>
          </p>
        </div>
        <SubmitButton pendingLabel="Signing in...">Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
