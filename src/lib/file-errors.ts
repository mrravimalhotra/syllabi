/** The kinds of file Syllabi reads, as shown in messages. */
const ACCEPTED_FILES = "photos (JPEG, PNG or WebP), a PDF, or a Word (.docx) file";

/**
 * A message for a file that couldn't be read: names the file and says what to
 * try, so the person isn't left guessing which of several files was the problem.
 */
export function fileReadError(file: { name: string; type: string }, err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  // Word errors already name the file and say what is wrong with it.
  if (message.includes(file.name)) return message;
  const name = `"${file.name}"`;
  if (err instanceof Error && err.name === "PasswordException") {
    return `${name} is password-protected. Remove the password in your PDF app, then add it again.`;
  }
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return `Couldn't read ${name}. The PDF may be damaged. Try opening it on your phone and saving a copy, or add photos of its pages instead.`;
  }
  if (file.type.startsWith("image/")) {
    return `Couldn't read the photo ${name}. Use a JPEG, PNG or WebP photo (some phones save HEIC, which isn't supported everywhere: choose "Most Compatible" in the camera settings).`;
  }
  return `Couldn't read ${name}. Add ${ACCEPTED_FILES}.`;
}
