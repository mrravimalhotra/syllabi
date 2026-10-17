// npm run scenarios [folder]
//
// Runs every sample file in test-material/ (git-ignored: real school books and
// worksheets must never be committed) through the app's real browser-side
// processing in Chromium, and reports what Syllabi would do with each: file
// type (text or scanned), pages, Word text and pictures, questions found, and
// whether it fits the upload and attachment limits. The AI steps (reading
// pages, answering) need API keys and are covered by the live checks in
// docs/test-scenarios.md.
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const folder = resolve(process.argv[2] ?? join(ROOT, "test-material"));
const SUPPORTED = new Set([".pdf", ".docx", ".jpg", ".jpeg", ".png", ".webp"]);

if (!existsSync(folder)) {
  console.log(`No ${folder} folder. Put sample PDFs, Word files and photos there (it is git-ignored).`);
  process.exit(0);
}
const files = readdirSync(folder, { recursive: true })
  .map((f) => join(folder, String(f)))
  .filter((f) => statSync(f).isFile() && SUPPORTED.has(extname(f).toLowerCase()))
  .sort();
if (files.length === 0) {
  console.log(`No PDF, Word or photo files in ${folder}.`);
  process.exit(0);
}

// Bundle the browser side with the app's own modules.
const outDir = mkdtempSync(join(tmpdir(), "scenarios-"));
await build({
  entryPoints: [join(ROOT, "scripts/scenarios/browser-entry.ts")],
  bundle: true,
  format: "iife",
  outfile: join(outDir, "bundle.js"),
  alias: { "@": join(ROOT, "src") },
  logLevel: "warning",
});

// Serve the bundle and public/ (pdf.js worker) from one local origin.
const server = createServer((req, res) => {
  const url = req.url ?? "/";
  const path =
    url === "/" ? null : url === "/bundle.js" ? join(outDir, "bundle.js") : join(ROOT, "public", url.split("?")[0]);
  if (!path) {
    res.setHeader("content-type", "text/html");
    res.end('<!doctype html><html><body><script src="/bundle.js"></script></body></html>');
    return;
  }
  if (!existsSync(path)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader("content-type", path.endsWith(".mjs") || path.endsWith(".js") ? "text/javascript" : "application/octet-stream");
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const executablePath = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
await page.goto(origin);

const rows = [];
for (const file of files) {
  const name = file.slice(folder.length + 1);
  const b64 = readFileSync(file).toString("base64");
  try {
    const r = await page.evaluate(
      async ([b64, name]) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return window.analyse(new File([bytes], name, { type: name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "" }));
      },
      [b64, name]
    );
    rows.push({ ok: true, ...r, name });
  } catch (err) {
    rows.push({ ok: false, name, error: String(err).slice(0, 200) });
  }
}
await browser.close();
server.close();

// Report
const lines = [
  "| File | Type | Pages / pictures | Questions found | Book upload | Notes |",
  "|---|---|---|---|---|---|",
];
for (const r of rows) {
  if (!r.ok) {
    lines.push(`| ${r.name} | **FAILED** | | | | ${r.error} |`);
    continue;
  }
  const shape =
    r.kind === "Word"
      ? `${r.textPages} text part(s), ${r.pictures} picture(s)${r.skippedPictures ? `, ${r.skippedPictures} unreadable` : ""}`
      : `${r.pages} page(s), largest ${Math.max(...r.imageKB)} KB`;
  const questions = r.questionsFromText === null ? "after AI reading" : String(r.questionsFromText);
  lines.push(`| ${r.name} | ${r.kind} | ${shape} | ${questions} | ${r.bookUploadBatches} request(s) | ${r.notes.join("; ")} |`);
}
const failed = rows.filter((r) => !r.ok).length;
const summary = `${rows.length} file(s), ${rows.length - failed} processed, ${failed} failed.`;
const report = `# Scenario check\n\n${new Date().toISOString()}\n\n${lines.join("\n")}\n\n${summary}\n`;
writeFileSync(join(folder, "report.md"), report);
console.log(lines.join("\n"));
console.log(`\n${summary} Report: ${join(folder, "report.md")}`);
process.exit(failed ? 1 : 0);
