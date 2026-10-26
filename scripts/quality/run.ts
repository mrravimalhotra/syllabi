import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateCompletion } from "@/lib/llm";
import { writeAndCheck } from "@/lib/generation/pipeline";
import type { MatchedChunk, SourceType } from "@/types/database";
import { JUDGE_SYSTEM, factChecks, parseJudge, scoreCase, type QualityCase } from "./grade";
import { used } from "./usage";

const DIR = join(process.cwd(), "scripts/quality");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const cases = (JSON.parse(readFileSync(join(DIR, "cases.json"), "utf8")) as QualityCase[]).filter((c) => !only || c.id.includes(only));
// A few at a time: fast, without tripping the AI's rate limit.
const AT_ONCE = Number(process.env.QUALITY_PARALLEL || 3);

interface CaseResult {
  id: string;
  score: number;
  pass: boolean;
  missing: string[];
  unwanted: string[];
  correct: number | null;
  complete: number | null;
  grounded: number | null;
  notes: string;
  /** What the app's own checker still flagged. */
  flagged: string[];
  answer: string;
}

async function runCase(c: QualityCase): Promise<CaseResult> {
  const chunks: MatchedChunk[] = c.passages.map((p, i) => ({
    id: `${c.id}-${i}`,
    document_id: "book",
    content: p.text,
    section_label: p.label,
    page_number: p.page,
    source_type: (p.type ?? "textbook") as SourceType,
    image_path: null,
    similarity: 0.8,
    book: `${c.subject} textbook`,
  }));
  const timings = { readingPhotosMs: 0, searchMs: 0, loadingImagesMs: 0, firstWordsMs: null, writingMs: 0, reviewMs: 0, repairMs: 0, model: "" };
  try {
    const { result, checks } = await writeAndCheck({
      taskType: c.task,
      student: { id: "quality", class_level: c.class, board: "CBSE" },
      prompt: c.question,
      language: "auto",
      chunks,
      coverageLow: chunks.length === 0,
      photos: [],
      sourcePageImages: [],
      searchQuery: c.question,
      timings,
    });
    const facts = factChecks(result.text, c.must, c.mustNot);
    const judged = await generateCompletion({
      taskType: "solution",
      systemInstructions: JUDGE_SYSTEM,
      ...(process.env.QUALITY_JUDGE_MODEL ? { model: process.env.QUALITY_JUDGE_MODEL } : {}),
      prompt: [
        `Question:\n${c.question}`,
        `Book passages given to the app:\n${c.passages.map((p) => `[${p.label}, p.${p.page}] ${p.text}`).join("\n") || "(none: the books do not cover this)"}`,
        `Expected answer (key points):\n${c.expected}`,
        `The app's answer:\n${result.text}`,
      ].join("\n\n"),
      temperature: 0,
      jsonSchema: {
        type: "object",
        properties: { correct: { type: "integer" }, complete: { type: "integer" }, grounded: { type: "integer" }, notes: { type: "string" } },
        required: ["correct", "complete", "grounded", "notes"],
      },
    });
    used.tokens += judged.usage.totalTokens;
    const scores = parseJudge(judged.text);
    const { score, pass } = scoreCase(scores, facts);
    return {
      id: c.id,
      score,
      pass,
      ...facts,
      correct: scores?.correct ?? null,
      complete: scores?.complete ?? null,
      grounded: scores?.grounded ?? null,
      notes: scores?.notes ?? "the examiner's reply could not be read",
      flagged: checks.filter((k) => !k.ok).map((k) => k.message),
      answer: result.text,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: c.id, score: 0, pass: false, missing: c.must, unwanted: [], correct: null, complete: null, grounded: null, notes: `failed: ${message}`, flagged: [], answer: "" };
  }
}

const results: CaseResult[] = [];
const started = Date.now();
for (let i = 0; i < cases.length; i += AT_ONCE) {
  const batch = await Promise.all(cases.slice(i, i + AT_ONCE).map(runCase));
  for (const r of batch) {
    results.push(r);
    const why = [r.missing.length ? `missing ${r.missing.join(", ")}` : "", r.unwanted.length ? `contains ${r.unwanted.join(", ")}` : "", r.pass ? "" : r.notes]
      .filter(Boolean)
      .join("; ");
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${String(r.score).padStart(3)}  ${r.id}${why ? `  (${why})` : ""}`);
  }
}

const passed = results.filter((r) => r.pass).length;
const average = Math.round(results.reduce((n, r) => n + r.score, 0) / Math.max(1, results.length));
console.log(`\n${passed} of ${results.length} passed · average score ${average} · ${used.tokens.toLocaleString("en-IN")} tokens · ${Math.round((Date.now() - started) / 1000)} s`);

const baselineFile = join(DIR, "baseline.json");
if (existsSync(baselineFile) && !only) {
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as { average: number; results: { id: string; pass: boolean; score: number }[] };
  const before = new Map(baseline.results.map((r) => [r.id, r]));
  const worse = results.filter((r) => before.get(r.id)?.pass && !r.pass).map((r) => r.id);
  const better = results.filter((r) => before.has(r.id) && !before.get(r.id)!.pass && r.pass).map((r) => r.id);
  console.log(`Against the baseline (average ${baseline.average}): ${average - baseline.average >= 0 ? "+" : ""}${average - baseline.average}`);
  if (better.length) console.log(`  now passing: ${better.join(", ")}`);
  if (worse.length) console.log(`  NOW FAILING: ${worse.join(", ")}`);
}

mkdirSync(join(DIR, "results"), { recursive: true });
const report = { at: new Date().toISOString(), model: process.env.QUALITY_MODEL || "gemini-flash-latest", average, passed, total: results.length, results };
writeFileSync(join(DIR, "results/latest.json"), JSON.stringify(report, null, 2));
if (args.includes("--save-baseline")) {
  writeFileSync(baselineFile, JSON.stringify({ ...report, results: results.map(({ id, pass, score }) => ({ id, pass, score })) }, null, 2) + "\n");
  console.log("Saved as the baseline (scripts/quality/baseline.json).");
}
process.exit(0);
