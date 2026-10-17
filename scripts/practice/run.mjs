// npm run test:practice — checks the practice question generators: thousands
// of quizzes across every kind of number and setting, verified independently.
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(mkdtempSync(join(tmpdir(), "practice-")), "test.mjs");
await build({
  entryPoints: [join(ROOT, "scripts/practice/test.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  alias: { "@": join(ROOT, "src") },
  logLevel: "error",
});
await import(pathToFileURL(out).href);
