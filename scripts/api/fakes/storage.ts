export const deleted: string[] = [];
export async function deletePrefix(prefix: string) {
  deleted.push(prefix);
}
export async function uploadSourceFile(path: string) {
  return path;
}
export async function downloadFile(): Promise<never> {
  throw new Error("NoSuchKey");
}
export async function getSignedUrl(path: string) {
  return `https://files.test/${path}`;
}
