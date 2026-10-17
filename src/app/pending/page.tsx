import { signOut } from "@/lib/actions/auth";
import { signupsOpen } from "@/lib/access";
import { AuthShell } from "@/components/AuthShell";
import { button } from "@/components/ui";

export const metadata = { title: "Awaiting approval" };

export default function PendingPage() {
  return (
    <AuthShell
      title="Awaiting approval"
      description={
        signupsOpen()
          ? "Your account was created, but it hasn't been approved yet. Sign in again later to check; once it is approved you can start using Syllabi."
          : "Syllabi is in private testing. Sign-ups will open soon."
      }
    >
      <form action={signOut}>
        <button className={`${button.secondary} w-full`}>Sign out</button>
      </form>
    </AuthShell>
  );
}
