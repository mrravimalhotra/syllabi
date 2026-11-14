// npm run test:quality — answers a fixed set of real-style questions with the real instructions, the real
// answer checker and the real AI (needs GOOGLE_API_KEY), then grades every answer: code checks the facts
// it must contain, and an AI examiner scores correctness, completeness and grounding against the expected
// answer. Run it before changing a prompt or a model, and compare with the saved baseline.
//   npm run test:quality                    all cases
//   npm run test:quality -- --only sci      cases whose id contains "sci"
//   npm run test:quality -- --save-baseline keep this run as the baseline to compare with
// Models: QUALITY_MODEL (answers, default gemini-flash-latest), QUALITY_JUDGE_MODEL (grading, default the same),
// QUALITY_WRITER (a free NVIDIA model that writes the first drafts instead; needs NVIDIA_API_KEY).
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.GOOGLE_API_KEY) {
  console.error("Set GOOGLE_API_KEY (the Gemini key) to run the quality test set.");
  process.exit(2);
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = join(ROOT, "node_modules/.cache/quality-test");
mkdirSync(dir, { recursive: true });
const out = join(dir, "run.mjs");
const here = (f) => join(ROOT, "scripts/quality", f);
await build({
  entryPoints: [here("run.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  alias: {
    // No database: models come from the environment, and usage is not recorded.
    "@/lib/llm/config": here("config.ts"),
    "@/lib/llm/usage": here("usage.ts"),
    "@": join(ROOT, "src"),
  },
  packages: "external",
  // "@/lib/llm" itself goes through the writer switch (llm-writer.ts), which imports the real one by its path.
  plugins: [
    {
      name: "answer-writer",
      setup(b) {
        b.onResolve({ filter: /^@\/lib\/llm$/ }, () => ({ path: here("llm-writer.ts") }));
      },
    },
  ],
  logLevel: "error",
});
await import(pathToFileURL(out).href);
