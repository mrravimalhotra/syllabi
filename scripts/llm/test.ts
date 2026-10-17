import { googleAdapter } from "@/lib/llm/providers/google";
import { scene } from "@/lib/study-pack/generate";
import { pcmToWav, splitForSpeech } from "@/lib/tts/wav";

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

// Study-pack scenes: only fixed choices and real emoji get through.
const good = scene({ backdrop: "forest", actors: [{ emoji: "🌳", motion: "sway" }, { emoji: "🐦", motion: "fly" }, { emoji: "👩🏽‍🏫", motion: "bounce" }], caption: "A bird in the trees" });
check("a valid scene is kept", good?.backdrop === "forest" && good.actors.length === 3, JSON.stringify(good));
check("an unknown backdrop is dropped", scene({ backdrop: "<script>", actors: [{ emoji: "🌳", motion: "sway" }], caption: "x" }) === null);
check("text that is not an emoji is dropped", scene({ backdrop: "sky", actors: [{ emoji: "<img onerror=x>", motion: "sway" }, { emoji: "abc", motion: "fly" }], caption: "x" }) === null);
check("an unknown motion becomes a gentle float", scene({ backdrop: "sky", actors: [{ emoji: "☀️", motion: "explode" }], caption: "x" })?.actors[0].motion === "float");
check("no more than 4 actors", (scene({ backdrop: "sky", actors: Array(9).fill({ emoji: "⭐", motion: "spin" }), caption: "x" })?.actors.length ?? 0) === 4);

// Speech audio: a WAV header and sensible splitting of long text.
const wav = pcmToWav(Buffer.alloc(48_000));
check("WAV audio has a valid header", wav.toString("ascii", 0, 4) === "RIFF" && wav.toString("ascii", 8, 12) === "WAVE" && wav.length === 48_044);
const long = Array(40).fill("This is one sentence about plants.").join(" ");
const parts = splitForSpeech(long, 300);
check("long text is split at sentence ends under the limit", parts.length > 1 && parts.every((p) => p.length <= 300 && p.endsWith(".")), parts.map((p) => p.length).join(","));

process.exit(failures ? 1 : 0);
