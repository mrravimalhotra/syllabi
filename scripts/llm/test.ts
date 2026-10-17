import { googleAdapter } from "@/lib/llm/providers/google";

process.env.GOOGLE_API_KEY = "test-key";

const calls: string[] = [];
const sse = (text: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }], role: "model" }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 } })}\r\n\r\n`;

// Fake Gemini: the main model is rate-limited, the stand-in answers.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const model = /models\/([^:]+):/.exec(url)?.[1] ?? "?";
  calls.push(model);
  if (model === "gemini-flash-latest") {
    return new Response(JSON.stringify({ error: { code: 429, message: "Resource has been exhausted. Please retry in 20s", status: "RESOURCE_EXHAUSTED" } }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.includes("streamGenerateContent")) {
    return new Response(sse("Hello ") + sse("world"), { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello world" }], role: "model" }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 } }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}) as typeof fetch;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
};

const base = { taskType: "ad_hoc" as const, systemInstructions: "x", prompt: "hi", model: "gemini-flash-latest" };

const started = Date.now();
const pieces: string[] = [];
const first = await googleAdapter.generateCompletion({ ...base, onText: (d) => pieces.push(d) });
const elapsed = Date.now() - started;
check("a rate-limited model switches to the stand-in without waiting", elapsed < 3000, `${elapsed} ms`);
check("the stand-in's answer is returned", first.text === "Hello world" && first.model === "gemini-flash-lite-latest", `${first.text} / ${first.model}`);
check("the result says which model it stood in for", first.standInFor === "gemini-flash-latest");
check("the stand-in's words were streamed", pieces.join("") === "Hello world", pieces.join("|"));
check("the main model was tried once", calls.filter((m) => m === "gemini-flash-latest").length === 1, calls.join(","));

calls.length = 0;
const second = await googleAdapter.generateCompletion({ ...base });
check("the next question skips the busy model", !calls.includes("gemini-flash-latest") && second.standInFor === "gemini-flash-latest", calls.join(","));

process.exit(failures ? 1 : 0);
