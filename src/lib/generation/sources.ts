import { getSignedUrl } from "@/lib/storage";

/** Adds a short-lived image URL to each source that has a page image (one URL per distinct image). */
export async function withImageUrls<T extends { image_path: string | null }>(sources: T[]): Promise<(T & { imageUrl?: string })[]> {
  const paths = [...new Set(sources.map((s) => s.image_path).filter((p): p is string => Boolean(p)))];
  const urls = new Map(await Promise.all(paths.map(async (p) => [p, await getSignedUrl(p)] as const)));
  return sources.map((s) => ({ ...s, imageUrl: s.image_path ? urls.get(s.image_path) : undefined }));
}
