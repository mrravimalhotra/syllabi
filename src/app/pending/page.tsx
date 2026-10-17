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
          ? "Your account has been created but is not active yet. An admin needs to grant you access. Check back soon."
          : "Syllabi is in private testing. Access will open to parents and tutors soon."
      }
    >
      <form action={signOut}>
        <button className={`${button.secondary} w-full`}>Sign out</button>
      </form>
    </AuthShell>
  );
}
