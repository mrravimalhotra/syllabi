import { getCurrentStudent } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { ReportProblem } from "@/components/ReportProblem";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const student = await getCurrentStudent();

  return (
    <div className="min-h-dvh print:bg-white">
      <AppNav name={student?.full_name ?? student?.email ?? ""} isAdmin={student?.role === "admin"} />
      {/* Bottom padding keeps content clear of the phone tab bar. */}
      <main
        id="main"
        className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-6 sm:pt-8 md:pb-12 print:max-w-none print:p-0"
      >
        {children}
      </main>
      <ReportProblem />
    </div>
  );
}
