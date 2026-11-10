import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePhotos } from "@/lib/generation/attachments";
import { entriesFrom, givenDate, indiaToday, isOneDay, type NewEntry } from "@/lib/homework/diary";
import { diaryFromPages } from "@/lib/homework/diary-text";
import { readDiaryTwice } from "@/lib/homework/read-diary";
import { recordTokenUsage } from "@/lib/llm/usage";
import { QuotaExceededError, checkQuota } from "@/lib/quota";
import { uploadSourceFile } from "@/lib/storage";
import { cleanText } from "@/lib/validate";
import { withoutRepeats, type KnownEntry } from "@/lib/homework/duplicates";

// Reading a few diary pages with the AI.
export const maxDuration = 120;

/** "Fri 23 Oct". */
const spoken = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export const COLUMNS = "id, kind, subject, title, topic, sub_topic, due_date, given_date, done, done_at, source, needs_check, duplicate_of, created_at";


/** The caller's homework and classwork entries, newest diary day first, and the recent days whose diary is in. */
export async function GET() {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const admin = createAdminClient();
  const [days, { data, error }] = await Promise.all([
    admin.from("homework_diary_days").select("day").eq("owner_id", auth.account.id).order("day", { ascending: false }).limit(30),
    admin
      .from("homework_entries")
      .select(COLUMNS)
      .eq("owner_id", auth.account.id)
      .order("given_date", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);
  if (error) return errorResponse(error, "homework GET", "Couldn't load the homework list. Check your connection and reload.");
  // The diary days are only for the missing-diary reminder: without them the list still shows.
  return NextResponse.json({ entries: data ?? [], diaryDays: days.error ? [] : (days.data ?? []).map((d) => d.day) });
}

/**
 * Saves a diary upload's entries. The same diary day added before (another file, a date read differently) is
 * recognised: clear repeats are left out, and entries that only resemble one in the list are added and marked as
 * possible duplicates.
 */
async function saveEntries(ownerId: string, entries: NewEntry[], folder: string) {
  const admin = createAdminClient();
  const { data: existing, error: listError } = await admin.from("homework_entries").select("id, kind, subject, title, topic, sub_topic, given_date").eq("owner_id", ownerId).limit(2000);
  if (listError) throw listError;
  const { add } = withoutRepeats(entries, (existing ?? []) as KnownEntry[]);
  const { data: inserted, error } = add.length
    ? await admin
        .from("homework_entries")
        .upsert(
          add.map((e) => ({ ...e, owner_id: ownerId, source_file: folder })),
          { onConflict: "owner_id,dedup_key", ignoreDuplicates: true }
        )
        .select("id, needs_check, duplicate_of")
    : { data: [], error: null };
  if (error) throw error;
  const added = inserted?.length ?? 0;
  return {
    added,
    skipped: entries.length - added,
    toCheck: (inserted ?? []).filter((e) => e.needs_check).length,
    possibleDuplicates: (inserted ?? []).filter((e) => e.duplicate_of).length,
  };
}

/**
 * Adds a class diary upload (PDF pages or photos): the pages are stored, read by the AI, and each period's
 * classwork and homework added as entries. A typed diary PDF is read from its own text, without the AI. Entries already there (the same diary uploaded again) are skipped.
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
    // A typed diary PDF carries its own text, read by code (exact, and free); photos are read by the AI.
    const typed = diaryFromPages(pages);
    if (!typed) {
      const quota = await checkQuota(user.id);
      if (quota.overQuota) throw new QuotaExceededError(quota);
    }

    // Keep the pages, so the original can be looked at again.
    const folder = `homework/${user.id}/${crypto.randomUUID()}/`;
    await Promise.all(pages.map((p, i) => uploadSourceFile(`${folder}page-${i + 1}.jpg`, Buffer.from(p.data, "base64"), p.mimeType)));

    const uploaded = indiaToday();
    let days = typed;
    let entries = typed ? entriesFrom(typed, fileName, uploaded) : [];
    if (!days) {
      // A photo is read twice; what the readings disagree on is marked to check.
      const read = await readDiaryTwice(pages, fileName, uploaded);
      ({ days, entries } = read);
      for (const r of read.results) await recordTokenUsage({ studentId: user.id, taskType: "ad_hoc", provider: r.provider, model: r.model, usage: r.usage });
    }

    const admin = createAdminClient();
    const diaryDays = [...new Set(days.filter((d) => d.periods.length > 0).map((d) => givenDate(d, fileName, uploaded, isOneDay(days!))))];
    if (diaryDays.length) {
      const { error: dayError } = await admin.from("homework_diary_days").upsert(diaryDays.map((day) => ({ owner_id: user.id, day })), { onConflict: "owner_id,day", ignoreDuplicates: true });
      if (dayError) console.error("[homework upload] diary days", dayError.message);
    }
    if (entries.length === 0) {
      const message = diaryDays.length
        ? `The diary for ${diaryDays.map(spoken).join(", ")} is in: no classwork or homework was set that day.`
        : "No classwork or homework was found on these pages. Check it is the class diary, and that the photo is clear.";
      return NextResponse.json({ added: 0, skipped: 0, message });
    }
    return NextResponse.json(await saveEntries(user.id, entries, folder));
  } catch (err) {
    return errorResponse(err, "homework upload", "Couldn't read the diary. Check the photo is clear and try again.");
  }
}
