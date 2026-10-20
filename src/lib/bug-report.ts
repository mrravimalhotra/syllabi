import { scrub, shorten } from "@/lib/debug/scrub";

export const BUG_STATUSES = ["open", "working", "fixed", "wontfix"] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];

export const STATUS_LABELS: Record<BugStatus, string> = {
  open: "Open",
  working: "Being fixed",
  fixed: "Fixed",
  wontfix: "Won't fix",
};

/** Most reports one person can raise in a day: stops a loop from filling the database. */
export const MAX_REPORTS_PER_DAY = 20;
const MAX_CONTEXT_BYTES = 250_000;

export interface BugReportInput {
  title: string;
  description: string;
  path: string;
  build: string | null;
  context: Record<string, unknown>;
}

/** Checks a problem report and returns it cleaned up (secrets and file data taken out again), or the message to show. */
export function parseBugReport(body: unknown): { ok: true; value: BugReportInput } | { ok: false; message: string } {
  if (body === null || typeof body !== "object") return { ok: false, message: "The report couldn't be read. Try again." };
  const b = body as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 200) : "";
  if (!title) return { ok: false, message: "Write a short title: what went wrong, in a few words." };
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length > 5000) return { ok: false, message: "The description is too long (over 5,000 characters). Shorten it." };
  const raw =
    b.context !== null && typeof b.context === "object" && !Array.isArray(b.context) ? (b.context as Record<string, unknown>) : {};
  if (JSON.stringify(raw).length > MAX_CONTEXT_BYTES * 2)
    return { ok: false, message: "The report is too large to send. Close other screens and try again." };
  const context = scrub(raw) as Record<string, unknown>;
  // scrub cuts long lists to 20: a report's own lists (steps, requests) are allowed their full length.
  for (const key of ["steps", "requests"] as const) {
    if (Array.isArray(raw[key])) context[key] = (raw[key] as unknown[]).slice(0, 80).map((item) => scrub(item));
  }
  const path = typeof b.path === "string" ? b.path.slice(0, 300) : "";
  const build = typeof b.build === "string" && b.build ? b.build.slice(0, 80) : null;
  return { ok: true, value: { title, description, path, build, context } };
}

interface ReportRow {
  number: number;
  title: string;
  description: string;
  path: string;
  app_build: string | null;
  status: string;
  created_at: string;
  resolution?: string | null;
  context: Record<string, unknown>;
  who?: string | null;
}

const fence = (text: string) => "```\n" + text.replace(/```/g, "'''") + "\n```";

type Context = {
  userAgent?: string;
  viewport?: string;
  url?: string;
  online?: boolean;
  steps?: { at: string; kind: string; text: string }[];
  requests?: {
    at: string;
    method: string;
    path: string;
    status: number | null;
    ms: number;
    sent?: string;
    received?: string;
    error?: string;
  }[];
  onScreen?: { fields?: { label: string; value: string }[]; text?: string };
};

function screenLines(onScreen: Context["onScreen"]): string[] {
  const lines: string[] = [];
  if (onScreen?.fields?.length) lines.push("", "## Typed on the screen (input)", ...onScreen.fields.map((f) => `- ${f.label}: ${f.value}`));
  if (onScreen?.text) lines.push("", "## What the screen showed (output)", fence(onScreen.text));
  return lines;
}

function requestLines(requests: Context["requests"]): string[] {
  if (!requests?.length) return [];
  const lines = ["", "## Requests the screen made"];
  for (const q of requests) {
    lines.push(
      `### ${q.at.slice(11, 19)} ${q.method} ${q.path} → ${q.status ?? "no answer"} (${q.ms} ms)${q.error ? ` ERROR ${q.error}` : ""}`,
    );
    if (q.sent) lines.push("Sent:", fence(q.sent));
    if (q.received) lines.push("Received:", fence(q.received));
  }
  return lines;
}

/** A ticket as one block of Markdown, to paste to whoever fixes it. */
export function reportMarkdown(r: ReportRow): string {
  const c = r.context as Context;
  return [
    `# Bug #${r.number}: ${r.title}`,
    "",
    `- Status: ${r.status}`,
    `- Raised: ${r.created_at}${r.who ? ` by ${r.who}` : ""}`,
    `- Screen: ${c.url ?? r.path}`,
    `- App version: ${r.app_build ?? "unknown"}`,
    `- Browser: ${c.userAgent ?? "unknown"}`,
    `- Window: ${c.viewport ?? "unknown"}${c.online === false ? " (offline)" : ""}`,
    "",
    "## What the person wrote",
    r.description || "(nothing added)",
    ...screenLines(c.onScreen),
    ...(c.steps?.length
      ? ["", "## Steps before the report (oldest first)", ...c.steps.map((s) => `- ${s.at.slice(11, 19)} [${s.kind}] ${s.text}`)]
      : []),
    ...requestLines(c.requests),
    ...(r.resolution ? ["", "## Resolution", r.resolution] : []),
  ].join("\n");
}

/** Plain-words status for a person (not the stored word). */
export const statusLabel = (status: string) => STATUS_LABELS[status as BugStatus] ?? shorten(status, 20);
