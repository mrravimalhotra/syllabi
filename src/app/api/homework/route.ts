import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePhotos } from "@/lib/generation/attachments";
import { entriesFrom } from "@/lib/homework/diary";
import { readDiary } from "@/lib/homework/read-diary";
import { recordTokenUsage } from "@/lib/llm/usage";
import { QuotaExceededError, checkQuota } from "@/lib/quota";
import { uploadSourceFile } from "@/lib/storage";
import { cleanText } from "@/lib/validate";

// Reading a few diary pages with the AI.
export const maxDuration = 120;

const COLUMNS = "id, kind, subject, title, topic, sub_topic, due_date, given_date, done, done_at, created_at";

/** Today's date in India, where the diaries are written. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** The caller's homework and classwork entries, newest diary day first. */
export async function GET() {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { data, error } = await createAdminClient()
    .from("homework_entries")
    .select(COLUMNS)
    .eq("owner_id", auth.account.id)
    .order("given_date", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) return errorResponse(error, "homework GET", "Couldn't load the homework list. Check your connection and reload.");
  return NextResponse.json({ entries: data ?? [] });
}

/**
 * Adds a class diary upload (PDF pages or photos): the pages are stored, read by the AI, and each period's
 * classwork and homework added as entries. Entries already there (the same diary uploaded again) are skipped.
 */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const user = auth.account;

  const body = (await request.json().catch(() => null)) as { fileName?: unknown; pages?: unknown } | null;
  if (!body) return apiError(400, "The diary couldn't be read. It may be too large; try fewer pages.");
  const pages = parsePhotos(body.pages);
  if (typeof pages === "string") return apiError(400, pages);
  if (pages.length === 0) return apiError(400, "Choose a photo or PDF of the class diary first.");
  const fileName = cleanText(body.fileName, 200) ?? "diary";

  try {
    const quota = await checkQuota(user.id);
    if (quota.overQuota) throw new QuotaExceededError(quota);

    // Keep the pages, so the original can be looked at again.
    const folder = `homework/${user.id}/${crypto.randomUUID()}/`;
    await Promise.all(pages.map((p, i) => uploadSourceFile(`${folder}page-${i + 1}.jpg`, Buffer.from(p.data, "base64"), p.mimeType)));

    const { days, result } = await readDiary(pages, fileName);
    await recordTokenUsage({ studentId: user.id, taskType: "ad_hoc", provider: result.provider, model: result.model, usage: result.usage });

    const entries = entriesFrom(days, fileName, today());
    if (entries.length === 0) {
      return NextResponse.json({ added: 0, skipped: 0, message: "No classwork or homework was found on these pages. Check it is the class diary, and that the photo is clear." });
    }
    const { data: inserted, error } = await createAdminClient()
      .from("homework_entries")
      .upsert(
        entries.map((e) => ({ ...e, owner_id: user.id, source_file: folder })),
        { onConflict: "owner_id,dedup_key", ignoreDuplicates: true }
      )
      .select("id");
    if (error) throw error;
    const added = inserted?.length ?? 0;
    return NextResponse.json({ added, skipped: entries.length - added });
  } catch (err) {
    return errorResponse(err, "homework upload", "Couldn't read the diary. Check the photo is clear and try again.");
  }
}
