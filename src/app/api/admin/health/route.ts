import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { embed, generateCompletion } from "@/lib/llm";
import { getLlmSetting } from "@/lib/llm/config";
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

async function run(name: string, fn: () => Promise<string>): Promise<Check> {
  const start = Date.now();
  try {
    return { name, ok: true, detail: await fn(), ms: Date.now() - start };
  } catch (err) {
    console.error(`[admin/health] ${name}`, err);
    return { name, ok: false, detail: safeError(err), ms: Date.now() - start };
  }
}

/**
 * Admin-only self-test of every outside service the app depends on, with the
 * real error (keys removed) shown on screen: the quickest way to find a wrong
 * key or setting after a deploy, since free-plan logs only last an hour.
 */
export async function POST() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const checks: Check[] = [];

  checks.push(
    await run("Settings (environment variables)", async () => {
      const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
      const padded = REQUIRED_ENV.filter((name) => {
        const v = process.env[name];
        return v && v !== v.trim();
      });
      if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
      if (padded.length) throw new Error(`Has spaces or a line break around the value: ${padded.join(", ")}`);
      return `All ${REQUIRED_ENV.length} required settings are present. Sign-ups open: ${process.env.OPEN_SIGNUPS === "true" ? "yes" : "no"}.`;
    })
  );

  checks.push(
    await run("Database", async () => {
      const db = createAdminClient();
      const { count, error } = await db.from("students").select("*", { count: "exact", head: true });
      if (error) throw error;
      const quota = await checkQuota(admin.id);
      return `Connected. ${count ?? 0} account(s). Your usage this month: ${quota.used.toLocaleString("en-IN")} of ${quota.quota.toLocaleString("en-IN")} tokens.`;
    })
  );

  checks.push(
    await run("AI answers (Gemini)", async () => {
      const { provider, model } = await getLlmSetting("ad_hoc");
      const result = await generateCompletion({
        taskType: "ad_hoc",
        systemInstructions: "Reply with the single word OK.",
        prompt: "Health check.",
        maxOutputTokens: 1024,
      });
      return `${provider} / ${model} replied "${result.text.trim().slice(0, 40)}".`;
    })
  );

  checks.push(
    await run("AI with Google Search", async () => {
      const result = await generateCompletion({
        taskType: "ad_hoc",
        systemInstructions: "Answer in one short sentence.",
        prompt: "What is today's date in India?",
        allowSearchGrounding: true,
        maxOutputTokens: 1024,
      });
      return result.usedSearchGrounding
        ? "Search was used and returned results."
        : `Answered without searching ("${result.text.trim().slice(0, 60)}"). That is allowed; search only runs when the model decides it needs it.`;
    })
  );

  checks.push(
    await run("Book search (embeddings)", async () => {
      const { model } = await getLlmSetting("embedding");
      const { embedding } = await embed("Find the LCM of 12, 18 and 30");
      if (embedding.length !== 768) throw new Error(`${model} returned ${embedding.length} numbers; the database expects 768.`);
      const found = await retrieveContext("Find the LCM of 12, 18 and 30", { ownerId: admin.id });
      return `${model} works (768 numbers). Searching your books found ${found.chunks.length} matching passage(s).`;
    })
  );

  checks.push(
    await run("File storage (Cloudflare R2)", async () => {
      const prefix = `health/${admin.id}/`;
      const key = `${prefix}${Date.now()}.txt`;
      await uploadSourceFile(key, Buffer.from("ok"), "text/plain");
      const back = await downloadFile(key);
      await deletePrefix(prefix);
      if (back.data.toString() !== "ok") throw new Error("Saved a test file but read back something different.");
      return `Saved, read back and deleted a test file in bucket "${process.env.R2_BUCKET_NAME ?? "syllabi"}".`;
    })
  );

  return NextResponse.json({ checks });
}
