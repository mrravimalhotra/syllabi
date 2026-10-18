import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored pdfjs-dist worker — a minified build artifact, not source we own.
    "public/pdf.worker.min.mjs",
  ]),
  // A ratchet, not a target: set at today's worst values so new code can't get more tangled.
  // Lower these numbers as the biggest functions (listed in docs/KNOWN-ISSUES.md Q.1) are split.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      complexity: ["error", 22],
      "max-lines-per-function": ["error", { max: 165, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 4],
      "max-params": ["error", 7],
    },
  },
]);

export default eslintConfig;
