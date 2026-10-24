import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { BACKUPS, embed, generateCompletion } from "@/lib/llm";
import { OPENAI_COMPATIBLE, hasKey, openAiCompatibleAdapter } from "@/lib/llm/providers/openai";
import { getLlmSetting } from "@/lib/llm/config";
import { rememberAppUrl } from "@/lib/ingestion/jobs";
import { checkQuota } from "@/lib/quota";
import { retrieveContext } from "@/lib/rag/retrieve";
import { deletePrefix, downloadFile, uploadSourceFile } from "@/lib/storage";

// Each Gemini check is a short call, but a cold start plus five services can
// pass the default limit.
export const maxDuration = 120;

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "ADMIN_EMAIL",
];

interface Check {
  name: string;
  ok: boolean;
  /** An optional extra that isn't set up: shown in grey and not counted as a failure. */
  skipped?: boolean;
  detail: string;
  ms: number;
}

/** Error text with anything that looks like a key or secret blanked out, short enough to show. */
function safeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "object" ? JSON.stringify(err) : String(err);
  let text = raw
    .replace(/AIza[\w-]{10,}/g, "[key]")
    .replace(/sb_(secret|publishable)_[\w-]+/g, "[key]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[key]");
  for (const name of ["R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_API_KEY"]) {
    const value = process.env[name];
    if (value && value.length > 6) text = text.split(value).join("[key]");
  }
  return text.slice(0, 600);
}

/** Thrown by a check of an optional extra that simply isn't set up: not a failure. */
class NotSetUp extends Error {}

async function run(name: string, fn: () => Promise<string>): Promise<Check> {
  const start = Date.now();
  try {
    return { name, ok: true, detail: await fn(), ms: Date.now() - start };
  } catch (err) {
    if (err instanceof NotSetUp) return { name, ok: true, skipped: true, detail: err.message, ms: Date.now() - start };
    console.error(`[admin/health] ${name}`, err);
    return { name, ok: false, detail: safeError(err), ms: Date.now() - start };
  }
}

const checkSettings = async () => {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  const padded = REQUIRED_ENV.filter((name) => {
    const v = process.env[name];
    return v && v !== v.trim();
  });
  if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
  if (padded.length) throw new Error(`Has spaces or a line break around the value: ${padded.join(", ")}`);
  return `All ${REQUIRED_ENV.length} required settings are present. Sign-ups open: ${process.env.OPEN_SIGNUPS === "true" ? "yes" : "no"}.`;
};

const checkDatabase = async (adminId: string) => {
  const db = createAdminClient();
  const { count, error } = await db.from("students").select("*", { count: "exact", head: true });
  if (error) throw error;
  const quota = await checkQuota(adminId);
  return `Connected. ${count ?? 0} account(s). Your usage this month: ${quota.used.toLocaleString("en-IN")} of ${quota.quota.toLocaleString("en-IN")} tokens.`;
};

/** Who really answered: a backup or stand-in is named, so a green check never hides that the chosen model is down. */
const answeredBy = (result: { provider: string; model: string; standInFor?: string }, provider: string, model: string) =>
  result.provider === provider && !result.standInFor
    ? `${provider} / ${model}`
    : `${result.provider} / ${result.model} (a backup: ${provider} / ${model} didn't answer)`;

const checkAnswers = async () => {
  const { provider, model } = await getLlmSetting("ad_hoc");
  const result = await generateCompletion({
    taskType: "ad_hoc",
    systemInstructions: "Reply with the single word OK.",
    prompt: "Health check.",
    maxOutputTokens: 1024,
  });
  return `${answeredBy(result, provider, model)} replied "${result.text.trim().slice(0, 40)}".`;
};

const checkSearch = async () => {
  const result = await generateCompletion({
    taskType: "ad_hoc",
    systemInstructions: "Answer in one short sentence.",
    prompt: "What is today's date in India?",
    allowSearchGrounding: true,
    maxOutputTokens: 1024,
  });
  if (result.searchSkipped) {
    throw new NotSetUp(
      "Optional. Google Search isn't available on this Gemini key (Google answered 429: quota exceeded; free keys often have no search quota). " +
        "Answers still work, just without web search. To turn search on, enable billing for this key's project in Google AI Studio."
    );
  }
  return result.usedSearchGrounding
    ? "Search was used and returned results."
    : `Answered without searching ("${result.text.trim().slice(0, 60)}"). That is allowed; search only runs when the model decides it needs it.`;
};

const checkEmbeddings = async (adminId: string) => {
  const { model } = await getLlmSetting("embedding");
  const { embedding } = await embed("Find the LCM of 12, 18 and 30");
  if (embedding.length !== 768) throw new Error(`${model} returned ${embedding.length} numbers; the database expects 768.`);
  const found = await retrieveContext("Find the LCM of 12, 18 and 30", { ownerId: adminId });
  return `${model} works (768 numbers). Searching your books found ${found.chunks.length} matching passage(s).`;
};

const checkStorage = async (adminId: string) => {
  const prefix = `health/${adminId}/`;
  const key = `${prefix}${Date.now()}.txt`;
  await uploadSourceFile(key, Buffer.from("ok"), "text/plain");
  const back = await downloadFile(key);
  await deletePrefix(prefix);
  if (back.data.toString() !== "ok") throw new Error("Saved a test file but read back something different.");
  return `Saved, read back and deleted a test file in bucket "${process.env.R2_BUCKET_NAME ?? "syllabi"}".`;
};

const checkPageReading = async () => {
  const { provider, model } = await getLlmSetting("ocr_extraction");
  const result = await generateCompletion({
    taskType: "ocr_extraction",
    systemInstructions: "Reply with one word.",
    prompt: "Say ok.",
    maxOutputTokens: 256,
  });
  return `${answeredBy(result, provider, model)} replied "${result.text.trim().slice(0, 20)}".${model === "gemini-flash-lite-latest" ? " If its free daily allowance runs out, pages wait until it resets (or are read by a backup AI that can read images, if one is set up)." : " If this model's free daily allowance runs out, pages are read with gemini-flash-lite-latest instead."}`;
};

const checkBackground = async (origin: string) => {
  // Tell the timer where this app lives, so it doesn't have to wait for the first upload.
  await rememberAppUrl(origin);
  const db = createAdminClient();
  const countOf = async (status: string) => {
    const { count, error } = await db.from("page_jobs").select("id", { count: "exact", head: true }).eq("status", status);
    if (error) throw error;
    return count ?? 0;
  };
  const [{ data: runner }, { data: timer }, pending, working, failed] = await Promise.all([
    db.from("job_runner").select("app_url").eq("id", 1).maybeSingle(),
    db.rpc("background_timer_ready"),
    countOf("pending"),
    countOf("working"),
    countOf("failed"),
  ]);
  const queue = `${pending} waiting, ${working} being read, ${failed} couldn't be read`;
  if (!timer) {
    throw new Error(
      `The once-a-minute timer isn't set up (Supabase extensions pg_cron and pg_net), so reading only continues while uploads arrive. Pages: ${queue}.`
    );
  }
  return `Timer runs every minute${runner?.app_url ? ` and calls ${runner.app_url}` : " (it starts calling the app after the first upload)"}. Pages: ${queue}.`;
};

const checkBackup = async (backup: (typeof BACKUPS)[number]) => {
  if (!hasKey(backup.provider)) {
    throw new NotSetUp(`Not set up (optional). Add ${OPENAI_COMPATIBLE[backup.provider].keyName} in Vercel to use it when Gemini runs out.`);
  }
  const model = backup.model();
  const result = await openAiCompatibleAdapter(backup.provider).generateCompletion({
    taskType: "ad_hoc",
    systemInstructions: "Reply with one word.",
    prompt: "Say ok.",
    model,
  });
  return `${result.model} replied "${result.text.trim().slice(0, 20)}".${backup.readsImages ? " Can also read page images." : ""}`;
};

/**
 * Admin-only self-test of every outside service the app depends on, with the
 * real error (keys removed) shown on screen: the quickest way to find a wrong
 * key or setting after a deploy, since free-plan logs only last an hour.
 */
export async function POST(request: Request) {
  const auth = await authenticateAdmin();
  if ("response" in auth) return auth.response;
  const adminId = auth.account.id;
  const origin = new URL(request.url).origin;

  // One after another, so the services aren't all hit at once.
  const checks: Check[] = [
    await run("Settings (environment variables)", checkSettings),
    await run("Database", () => checkDatabase(adminId)),
    await run("AI answers (Gemini)", checkAnswers),
    await run("AI with Google Search", checkSearch),
    await run("Book search (embeddings)", () => checkEmbeddings(adminId)),
    await run("File storage (Cloudflare R2)", () => checkStorage(adminId)),
    await run("Reading book pages (AI)", checkPageReading),
    await run("Background page reading", () => checkBackground(origin)),
  ];
  // The free services that stand in when Gemini can't answer: each one whose key is set gets a tiny test.
  for (const backup of BACKUPS) checks.push(await run(`Backup AI: ${backup.provider}`, () => checkBackup(backup)));

  return NextResponse.json({ checks });
}
