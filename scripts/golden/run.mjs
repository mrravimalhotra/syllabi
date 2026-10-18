// npm run test:golden — checks the maths, answer-checking and question-splitting
// code still gives exactly the same output for thousands of fixed inputs.
// `npm run test:golden -- --update` accepts the current output as the expected one.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = join(ROOT, "node_modules/.cache/golden-test");
mkdirSync(dir, { recursive: true });
const out = join(dir, "cases.mjs");
await build({
  entryPoints: [join(ROOT, "scripts/golden/cases.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  alias: { "@": join(ROOT, "src") },
  jsx: "automatic",
  packages: "external",
  logLevel: "error",
});
const { cases } = await import(pathToFileURL(out).href);
const file = join(ROOT, "scripts/golden/expected.json");

if (process.argv.includes("--update") || !existsSync(file)) {
  writeFileSync(file, JSON.stringify(cases, null, 0).replace(/","/g, '",\n"') + "\n");
  console.log(`Wrote ${Object.keys(cases).length} expected results to scripts/golden/expected.json`);
  process.exit(0);
}
const expected = JSON.parse(readFileSync(file, "utf8"));
const changed = Object.keys({ ...expected, ...cases }).filter((k) => expected[k] !== cases[k]);
console.log(`${Object.keys(cases).length - changed.length} of ${Object.keys(expected).length} results unchanged, ${changed.length} different`);
for (const k of changed.slice(0, 15)) console.log(`  DIFFERENT  ${k}${expected[k] === undefined ? " (new case)" : cases[k] === undefined ? " (case gone)" : ""}`);
process.exit(changed.length ? 1 : 0);
