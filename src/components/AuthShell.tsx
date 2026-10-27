import Link from "next/link";
import { BookIcon, PrinterIcon, ShieldIcon, SparklesIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo, card, cx } from "@/components/ui";

const POINTS = [
  { icon: BookIcon, text: "Answers come from your child's or student's own books" },
  { icon: SparklesIcon, text: "Step-by-step solutions, revision notes and sample papers" },
  { icon: PrinterIcon, text: "Print or save every answer as a PDF" },
  { icon: ShieldIcon, text: "Your books stay private to your account" },
];

/** Sign-in, sign-up and password pages: the form on a card, with a short product intro beside it on wide screens. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl"
        />
        <Link href="/login" className="relative flex items-center gap-2.5 text-lg font-semibold">
          <Logo className="h-9 w-9" /> Syllabi
        </Link>
        <div className="relative space-y-8">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Help them study from the books they actually use.
          </h2>
          <ul className="space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-brand-100">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4.5 w-4.5 text-white" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200">For parents and tutors (18+).</p>
      </aside>

      <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="absolute top-3 right-3">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm animate-fade-in space-y-6">
          <Link href="/login" className="flex items-center gap-2 text-base font-semibold text-slate-900 lg:hidden">
            <Logo className="h-8 w-8" /> Syllabi
          </Link>
          <div className={cx(card, "space-y-6 p-6 sm:p-8")}>
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
              {description && <div className="text-sm text-slate-500">{description}</div>}
            </div>
            {children}
          </div>
          {footer && <div className="text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
