import { createAdminClient } from "@/lib/supabase/admin";
import { deletePrefix, listKeys } from "@/lib/storage";

/**
 * Removes the stored diary pages no entry points to any more: an upload whose entries were all removed or merged
 * away, or that added nothing new. Run after a diary is added and after an entry is removed. Never fails the request
 * it runs in: a page left behind is only tidied up next time. Returns how many uploads were removed.
 */
export async function removeUnusedDiaryPages(ownerId: string): Promise<number> {
  try {
    const root = `homework/${ownerId}/`;
    const folders = new Set((await listKeys(root)).map((key) => key.slice(0, key.indexOf("/", root.length) + 1)).filter((folder) => folder.length > root.length));
    if (folders.size === 0) return 0;
    const { data, error } = await createAdminClient().from("homework_entries").select("source_file").eq("owner_id", ownerId).limit(5000);
    // Without the list of entries nothing can be judged unused.
    if (error) throw error;
    const used = new Set((data ?? []).map((row) => row.source_file as string | null));
    const unused = [...folders].filter((folder) => !used.has(folder));
    for (const folder of unused) await deletePrefix(folder);
    return unused.length;
  } catch (err) {
    console.error("[homework] removing unused diary pages", err instanceof Error ? err.message : err);
    return 0;
  }
}
