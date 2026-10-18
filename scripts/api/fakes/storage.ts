// An in-memory stand-in for the file storage (R2).
export const files = new Map<string, { data: Buffer; contentType: string }>();
export const deleted: string[] = [];

export async function deletePrefix(prefix: string) {
  deleted.push(prefix);
  for (const key of [...files.keys()]) if (key.startsWith(prefix)) files.delete(key);
}
export async function uploadSourceFile(path: string, data?: Buffer, contentType = "application/octet-stream") {
  if (data) files.set(path, { data, contentType });
  return path;
}
export async function downloadFile(path: string): Promise<{ data: Buffer; contentType: string }> {
  const file = files.get(path);
  if (!file) throw new Error("NoSuchKey");
  return file;
}
export async function listKeys(prefix: string) {
  return [...files.keys()].filter((k) => k.startsWith(prefix));
}
export async function getSignedUrl(path: string) {
  return `https://files.test/${path}`;
}
