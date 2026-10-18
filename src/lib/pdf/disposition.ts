/** The download name header: Hindi, Marathi and French titles keep their letters (filename*), with a plain fallback. */
export function pdfDisposition(title: string): string {
  const name = title
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .trim()
    .slice(0, 80);
  const asciiName = name.replace(/[^\w\- ()]+/g, "").trim() || "Syllabi answer";
  return `inline; filename="${asciiName}.pdf"; filename*=UTF-8''${encodeURIComponent(name || asciiName)}.pdf`;
}
