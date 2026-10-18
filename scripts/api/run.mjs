// npm run test:api — calls the real API routes with a fake database and a fake
// signed-in person, and checks the status codes and messages they return.
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fakes = (name) => join(ROOT, "scripts/api/fakes", name);
// Built inside the project so installed packages (next, supabase...) resolve at run time.
const dir = join(ROOT, "node_modules/.cache/api-test");
mkdirSync(dir, { recursive: true });
const out = join(dir, "test.mjs");
await build({
  entryPoints: [join(ROOT, "scripts/api/test.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  alias: {
    "@/lib/supabase/admin": fakes("admin.ts"),
    "@/lib/auth": fakes("auth.ts"),
    "@/lib/supabase/server": fakes("server.ts"),
    "@/lib/storage": fakes("storage.ts"),
    "@supabase/ssr": fakes("ssr.ts"),
    "@/lib/generation/pipeline": fakes("pipeline.ts"),
    "@/lib/llm/usage": fakes("llm-usage.ts"),
    "@/lib/llm/config": fakes("llm-config.ts"),
    "@": join(ROOT, "src"),
  },
  packages: "external",
  plugins: [
    {
      // Node's ES module loader needs the file extension that Next's own build adds for it.
      name: "next-extensions",
      setup(b) {
        b.onResolve({ filter: /^next\/(server|headers|navigation|cache)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
        // Exactly "@/lib/llm" (the AI layer), not its sub-modules.
        b.onResolve({ filter: /^@\/lib\/llm$/ }, () => ({ path: fakes("llm.ts") }));
      },
    },
  ],
  logLevel: "error",
});
await import(pathToFileURL(out).href);
