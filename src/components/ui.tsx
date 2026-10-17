// Shared building blocks so every screen looks and behaves the same. Plain
// class strings for native elements (buttons, links, inputs) plus a few small
// components. Nothing here uses hooks, so it works in server and client code.

import { AlertIcon, CheckIcon, InfoIcon } from "@/components/icons";

/** Joins class names, skipping empty ones. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Buttons: at least 44px tall on phones (an easy tap target), compact on desktop.
const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10";

export const button = {
  primary: cx(BUTTON_BASE, "px-4 bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800"),
  secondary: cx(BUTTON_BASE, "px-4 border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50 active:bg-slate-100"),
  ghost: cx(BUTTON_BASE, "px-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900"),
  danger: cx(BUTTON_BASE, "px-4 bg-red-600 text-white shadow-sm hover:bg-red-700"),
  dangerGhost: cx(BUTTON_BASE, "px-3 text-red-600 hover:bg-red-50"),
  /** Small icon-and-label button for toolbars (Print, PDF, Copy...). */
  small:
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50 sm:min-h-8",
  smallPrimary:
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-brand-700 sm:min-h-8",
  smallDanger:
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-600 shadow-xs transition-colors hover:bg-red-50 sm:min-h-8",
  /** Square icon-only button; give it an aria-label. */
  icon: "inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:h-8 sm:w-8",
  iconDanger:
    "inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 sm:h-8 sm:w-8",
};

export const input =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 transition focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none disabled:bg-slate-50";

export const label = "block text-sm font-medium text-slate-700";

export const card = "rounded-2xl border border-slate-200 bg-white shadow-xs";

export const link = "font-medium text-brand-700 underline-offset-4 hover:underline";

/** A labelled form field: label, control, optional hint below. */
export function Field({
  label: text,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className={label}>
        {text}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const ALERT_STYLES = {
  error: { box: "border-red-200 bg-red-50 text-red-800", icon: AlertIcon, iconColor: "text-red-500" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertIcon, iconColor: "text-amber-500" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckIcon, iconColor: "text-emerald-600" },
  info: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: InfoIcon, iconColor: "text-brand-600" },
};

/** A message box. Errors are announced to screen readers straight away. */
export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof ALERT_STYLES;
  children: React.ReactNode;
  className?: string;
}) {
  const style = ALERT_STYLES[tone];
  const Icon = style.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm animate-fade-in", style.box, className)}
    >
      <Icon className={cx("mt-px h-4.5 w-4.5 shrink-0", style.iconColor)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("animate-spin", className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A grey placeholder bar shown while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--color-slate-100)_0%,var(--color-slate-200)_50%,var(--color-slate-100)_100%)] bg-[length:200%_100%]",
        className
      )}
    />
  );
}

/** The usual "loading a page" placeholder: a heading and a few cards. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={cx(card, "flex flex-col items-center px-6 py-12 text-center")}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <p className="mt-4 text-base font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A usage bar that turns amber near the limit and red at it. */
export function Meter({ value, max, label: text }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div
      role="meter"
      aria-label={text}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="h-2 overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className={cx(
          "h-full rounded-full transition-[width] duration-500",
          pct >= 100 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-brand-600"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** The Syllabi mark: an open book, matching the app icon. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--color-brand-600)" />
      <path d="M256 150c-40-28-96-36-150-30v232c54-6 110 2 150 30z" fill="#fff" />
      <path d="M256 150c40-28 96-36 150-30v232c-54-6-110 2-150 30z" fill="var(--color-brand-200)" />
      <path d="M138 190h86M138 230h86M138 270h70" stroke="var(--color-brand-600)" strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}
