// npm run test:llm — checks how the Gemini adapter behaves when a model is
// busy: it must switch to the stand-in at once (no waiting), remember the busy
// model for a minute, and stream the stand-in's words. Gemini is faked.
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(mkdtempSync(join(tmpdir(), "llm-")), "test.mjs");
await build({
  entryPoints: [join(ROOT, "scripts/llm/test.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  // The usage recorder saves through Next's after(), which needs the app's server; this test has no database.
  alias: { "@/lib/llm/usage": join(ROOT, "scripts/api/fakes/llm-usage.ts"), "@": join(ROOT, "src") },
  logLevel: "error",
});
await import(pathToFileURL(out).href);
