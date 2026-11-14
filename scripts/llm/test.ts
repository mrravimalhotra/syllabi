import { googleAdapter, googleEmbedMany } from "@/lib/llm/providers/google";
import { generateFreeFirst } from "@/lib/llm";
import { verifyAnswer } from "@/lib/generation/verify";
import { resetFreeKeyRests } from "@/lib/llm/google-keys";
import { openAiCompatibleAdapter } from "@/lib/llm/providers/openai";
import { scene } from "@/lib/study-pack/generate";
import { pcmToWav, splitForSpeech } from "@/lib/tts/wav";

process.env.GOOGLE_API_KEY = "test-key";
process.env.GROQ_API_KEY = "test-groq-key";

const calls: string[] = [];
const sse = (text: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }], role: "model" }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 } })}\r\n\r\n`;

// Fake Gemini: the main model is rate-limited, the stand-in answers.
interface SentBody {
  tools?: { googleSearch?: unknown }[];
  systemInstruction?: unknown;
  contents: { parts: { text?: string; inlineData?: { mimeType: string } }[] }[];
  generationConfig: { temperature?: number; maxOutputTokens?: number; responseMimeType?: string; responseSchema?: { type?: string } };
}
const openAiBodies: { messages: { role: string; content: unknown }[]; temperature?: number; model: string }[] = [];
type Scenario = (url: string, body: SentBody) => Response | null;
let scenario: Scenario | null = null;
// Set while the answer-quality test runs, so the fake also answers for the stand-in (to show it is never asked).
let answerTest = false;
// What the OpenAI-style services answer, when a test sets it.
let openAiReply: (() => Response) | null = null;
const requests: { url: string; body: SentBody; key: string | null }[] = [];
const reply = (candidate: object, usage: object = { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 }) =>
  new Response(JSON.stringify({ candidates: [candidate], usageMetadata: usage }), { status: 200, headers: { "content-type": "application/json" } });
const errorReply = (status: number, message: string, code = "ERROR") =>
  new Response(JSON.stringify({ error: { code: status, message, status: code } }), { status, headers: { "content-type": "application/json" } });

// Models that go silent: no reply at all, or one piece and then nothing; either ends only when the call gives up.
const silent = new Map<string, "no reply" | "stalls">();
const untilAborted = (signal: AbortSignal | null | undefined) =>
  new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const model = /models\/([^:]+):/.exec(url)?.[1] ?? "?";
  calls.push(model);
  const quiet = silent.get(model);
  if (quiet === "no reply") return untilAborted(init?.signal);
  if (quiet === "stalls") {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse("Partial ")));
        init?.signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  if (url.includes("chat/completions")) {
    openAiBodies.push(JSON.parse(String(init?.body)));
    if (openAiReply) return openAiReply();
    return new Response(JSON.stringify({ model: "served-model", choices: [{ message: { content: "Groq says hi" }, finish_reason: "length" }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (scenario && (model.startsWith("test-") || model.startsWith("gemini-answer") || (model === "gemini-flash-lite-latest" && answerTest))) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, body, key: new Headers(init?.headers).get("x-goog-api-key") });
    const made = scenario(url, body);
    if (made) return made;
  }
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

// The stand-in is for jobs other than answers (here, reading a page); answers never switch (tested below).
const base = { taskType: "ocr_extraction" as const, systemInstructions: "x", prompt: "hi", model: "gemini-flash-latest" };

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

// A model that goes silent is given up on, and the stand-in answers (the waits are shortened for the test).
process.env.GEMINI_FIRST_WORDS_TIMEOUT_MS = "300";
process.env.GEMINI_STALL_TIMEOUT_MS = "300";
for (const [model, how] of [["gemini-silent-model", "no reply"], ["gemini-stalling-model", "stalls"]] as const) {
  silent.set(model, how);
  calls.length = 0;
  const words: string[] = [];
  let restarts = 0;
  const t0 = Date.now();
  const res = await googleAdapter.generateCompletion({ ...base, model, allowSearchGrounding: true, onText: (d) => words.push(d), onRestart: () => restarts++ });
  check(`a model that ${how === "no reply" ? "never replies" : "stops in the middle"} is given up on and the stand-in answers`, res.text === "Hello world" && res.standInFor === model && Date.now() - t0 < 3000, `${res.text} ${res.standInFor} ${Date.now() - t0} ms`);
  check(`${how === "no reply" ? "a silent model is tried once, even with search allowed" : "the stalled draft is started again"}`, how === "no reply" ? calls.filter((m) => m === model).length === 1 : restarts >= 1 && words.join("").endsWith("Hello world"), `${calls.join(",")} restarts=${restarts}`);
}
{
  // The same for a call that isn't streamed (the checker, a second marking): it is given up on, and the stand-in answers.
  process.env.GEMINI_REPLY_TIMEOUT_MS = "300";
  silent.set("gemini-quiet-model", "no reply");
  const t0 = Date.now();
  const res = await googleAdapter.generateCompletion({ ...base, model: "gemini-quiet-model" });
  check("a call answered in one piece that never answers is given up on and the stand-in answers", res.text === "Hello world" && res.standInFor === "gemini-quiet-model" && Date.now() - t0 < 3000, `${res.text} ${res.standInFor}`);
  delete process.env.GEMINI_REPLY_TIMEOUT_MS;
}
delete process.env.GEMINI_FIRST_WORDS_TIMEOUT_MS;
delete process.env.GEMINI_STALL_TIMEOUT_MS;

// How a single call is built and read (the model name starts with "test-" so the fake above lets the scenario answer).
const one = { taskType: "ocr_extraction" as const, systemInstructions: "x", prompt: "hi", model: "gemini-test-model" };
const ok = (text = "Fine.", extra: object = {}) => reply({ content: { parts: [{ text }], role: "model" }, finishReason: "STOP", ...extra });
// The stand-in for a "gemini-" model is the lite model; scenarios answer it normally unless they say otherwise.
const setScenario = (fn: Scenario) => {
  scenario = fn;
  requests.length = 0;
  calls.length = 0;
};
const asked = async (req: Record<string, unknown>) => googleAdapter.generateCompletion({ ...one, ...req } as never);

// The request: reference material, the question, pictures, defaults and a JSON schema.
setScenario(() => ok());
await asked({ model: "test-model", context: "Plants make food.", images: [{ data: "QUJD", mimeType: "image/png" }] });
const sent = requests[0].body;
check("the request carries the reference material first, then the question, then the pictures", sent.contents[0].parts[0].text?.startsWith("Reference material") === true && sent.contents[0].parts[1].text === "hi" && sent.contents[0].parts[2].inlineData?.mimeType === "image/png", JSON.stringify(sent.contents[0].parts).slice(0, 120));
check("a question has a steady temperature and room for a long answer by default", sent.generationConfig.temperature === 0.4 && sent.generationConfig.maxOutputTokens === 32768, JSON.stringify(sent.generationConfig));
check("the instructions go in as the system instruction", JSON.stringify(sent.systemInstruction).includes('"x"'));
await asked({ model: "test-model", jsonSchema: { type: "object" }, temperature: 0.1, maxOutputTokens: 100 });
const shaped = requests[1].body.generationConfig;
check("a JSON schema, temperature and output limit are passed on", shaped.responseMimeType === "application/json" && shaped.responseSchema?.type === "object" && shaped.temperature === 0.1 && shaped.maxOutputTokens === 100, JSON.stringify(shaped));

// The answer: tokens used, truncation, search suggestions.
setScenario(() => reply({ content: { parts: [{ text: "Long answer" }], role: "model" }, finishReason: "MAX_TOKENS" }, { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 }));
const cut = await asked({ model: "test-model" });
check("the tokens used are reported", cut.usage.inputTokens === 10 && cut.usage.outputTokens === 20 && cut.usage.totalTokens === 30, JSON.stringify(cut.usage));
check("an answer that hit the length limit says so", cut.truncated === true && /reached the length limit/.test(cut.text));
setScenario(() => ok("Grounded.", { groundingMetadata: { webSearchQueries: ["plants"], searchEntryPoint: { renderedContent: "<div>Search</div>" } } }));
const grounded = await asked({ model: "test-model", allowSearchGrounding: true });
check("search grounding is reported with its suggestions", grounded.usedSearchGrounding === true && grounded.searchSuggestionsHtml === "<div>Search</div>" && grounded.searchSkipped === false);
check("search is only asked for when allowed", requests[0].body.tools?.[0]?.googleSearch !== undefined);

// Search is a bonus: a key without search quota gets the answer without it.
setScenario((_url, body) => (body.tools ? errorReply(429, "Quota exceeded for search grounding", "RESOURCE_EXHAUSTED") : ok("No search needed.")));
const noSearch = await asked({ model: "test-model", allowSearchGrounding: true });
check("a refused search is skipped and the answer still comes", noSearch.text === "No search needed." && noSearch.searchSkipped === true && noSearch.usedSearchGrounding === false, `${noSearch.text} ${noSearch.searchSkipped}`);

// A blocked reply is explained in plain words.
setScenario(() => reply({ content: { parts: [] }, finishReason: "SAFETY" }));
const blocked = await asked({ model: "test-model" }).then(() => null, (e) => e);
check("a blocked answer says so plainly and names the reason", blocked?.constructor?.name === "BlockedReplyError" && /safety filter/.test(blocked.message) && blocked.finishReason === "SAFETY", `${blocked?.constructor?.name} ${blocked?.message}`);
setScenario(() => reply({ content: { parts: [] }, finishReason: "RECITATION" }));
const recited = await asked({ model: "test-model" }).then(() => null, (e) => e);
check("a copied-text refusal has its own message", /word for word/.test(recited?.message ?? ""), recited?.message);
check("a blocked answer does not switch to the stand-in", !calls.includes("gemini-flash-lite-latest"), calls.join(","));

// Other errors do not switch models; a busy model and a failing stand-in report the first problem.
setScenario(() => errorReply(400, "Bad request: nonsense"));
const rejected = await asked({ model: "test-model" }).then(() => null, (e) => e);
check("a plain error is reported, not hidden by switching models", /nonsense/.test(rejected?.message ?? "") && !calls.includes("gemini-flash-lite-latest"), `${rejected?.message} ${calls.join(",")}`);
setScenario((url) => (/models\/test-/.test(url) ? errorReply(503, "The model is overloaded", "UNAVAILABLE") : errorReply(500, "stand-in broke")));
const both = await asked({ model: "test-model" }).then(() => null, (e) => e);
check("when the stand-in fails too, the first model's problem is reported", /overloaded/.test(both?.message ?? ""), both?.message);

// Thinking: the budget is sent, gets its own room on top of the answer's, and is counted as tokens used.
setScenario(() => ok("Worked out.", {}));
await asked({ model: "test-model", maxOutputTokens: 4096, thinking: 8192 });
const thought = requests[0].body.generationConfig as SentBody["generationConfig"] & { thinkingConfig?: { thinkingBudget?: number } };
check("a thinking budget is sent, with room for it on top of the answer", thought.thinkingConfig?.thinkingBudget === 8192 && thought.maxOutputTokens === 4096 + 8192, JSON.stringify(thought));
await asked({ model: "test-model" });
check("no thinking setting is sent unless asked for", !("thinkingConfig" in requests[1].body.generationConfig), JSON.stringify(requests[1].body.generationConfig));
setScenario(() => reply({ content: { parts: [{ text: "Done." }], role: "model" }, finishReason: "STOP" }, { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 500, totalTokenCount: 530 }));
const counted = await asked({ model: "test-model", thinking: 1024 });
check("the thinking is counted with the answer's tokens", counted.usage.outputTokens === 520 && counted.usage.totalTokens === 530, JSON.stringify(counted.usage));
setScenario((_url, body) => ((body.generationConfig as { thinkingConfig?: unknown }).thinkingConfig ? errorReply(400, "Invalid argument: thinking_config is not supported by this model", "INVALID_ARGUMENT") : ok("Answered without thinking.")));
const plain = await asked({ model: "test-model", thinking: 8192 });
check("a model that refuses the thinking setting is asked again without it", plain.text === "Answered without thinking." && requests.length === 2, `${plain.text} ${requests.length}`);
scenario = null;

// The other AI services (Groq, NVIDIA, OpenRouter, Mistral, OpenAI) speak OpenAI's chat format.
const groq = await openAiCompatibleAdapter("groq").generateCompletion({ taskType: "ad_hoc", systemInstructions: "be kind", prompt: "hi", context: "Plants.", images: [{ data: "QUJD", mimeType: "image/png" }], model: "some-model" });
const userMessage = openAiBodies[0].messages[1].content as { type: string; text?: string; image_url?: { url: string } }[];
check("an OpenAI-style call sends the instructions, the question with its reference material, and the pictures", openAiBodies[0].messages[0].content === "be kind" && userMessage[0].text === "Reference material (RAG context):\nPlants.\n\nhi" && userMessage[1].image_url?.url === "data:image/png;base64,QUJD" && openAiBodies[0].temperature === 0.4, JSON.stringify(openAiBodies[0]).slice(0, 200));
check("its answer, tokens and the model that really answered are reported", groq.text === "Groq says hi" && groq.truncated === true && groq.model === "served-model" && groq.usage.totalTokens === 6 && groq.usedSearchGrounding === false);

// The free-tier key goes first; the paid key takes over when the free tier can't answer.
process.env.GOOGLE_API_KEY_FREE = "free-key";
resetFreeKeyRests();
setScenario(() => ok("Free answer."));
const freeAnswer = await asked({ model: "test-free-a" });
check("with a free key set, it is asked first and the answer says so", freeAnswer.freeTier === true && requests.length === 1 && requests[0].key === "free-key", JSON.stringify(requests.map((r) => r.key)));
setScenario(() => (requests.at(-1)?.key === "free-key" ? errorReply(429, "Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier", "RESOURCE_EXHAUSTED") : ok("Paid answer.")));
let restarted = 0;
const paidAnswer = await asked({ model: "test-free-b", onRestart: () => restarted++ });
check("the free tier over its daily limit hands over to the paid key at once", paidAnswer.text === "Paid answer." && !paidAnswer.freeTier && requests.map((r) => r.key).join() === "free-key,test-key" && restarted >= 1, JSON.stringify(requests.map((r) => r.key)));
requests.length = 0;
await asked({ model: "test-free-b" });
check("a model the free key just failed on goes straight to the paid key", requests.map((r) => r.key).join() === "test-key", JSON.stringify(requests.map((r) => r.key)));
setScenario(() => (requests.at(-1)?.key === "free-key" ? errorReply(400, "Some bad request") : ok()));
await asked({ model: "test-free-c" }).catch(() => null);
check("another refusal from the free key also falls back to the paid key", requests[0].key === "free-key" && requests.at(-1)?.key === "test-key", JSON.stringify(requests.map((r) => r.key)));
setScenario(() =>
  requests.at(-1)?.key === "free-key"
    ? errorReply(503, "The model is overloaded.", "UNAVAILABLE")
    : new Response(JSON.stringify({ embeddings: [{ values: [1, 2] }] }), { status: 200, headers: { "content-type": "application/json" } })
);
const embedded = await googleEmbedMany(["plants"], "test-embed");
check("embeddings use the free key first and the paid key when it is busy", embedded[0].embedding.join() === "1,2" && requests.map((r) => r.key).join() === "free-key,test-key", JSON.stringify(requests.map((r) => r.key)));
delete process.env.GOOGLE_API_KEY_FREE;
setScenario(() => ok());
await asked({ model: "test-free-d" });
check("without a free key, only the paid key is used", requests.map((r) => r.key).join() === "test-key", JSON.stringify(requests.map((r) => r.key)));
scenario = null;

// Small jobs (search words) go to OpenRouter's free models first; Gemini answers when the free one can't.
{
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  const chat = (content: string, status = 200) =>
    new Response(status === 200 ? JSON.stringify({ model: "free/model", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }) : JSON.stringify({ error: { message: content, code: status } }), { status, headers: { "content-type": "application/json" } });
  const isJson = (t: string) => t.trim().startsWith("{");
  const small = { taskType: "ad_hoc" as const, systemInstructions: "search words", prompt: "Why did Akbar start Sulh-i-kul?", temperature: 0 };
  setScenario(() => ok('{"queries":["gemini"]}'));
  openAiReply = () => chat('{"queries":["free"]}');
  const free = await generateFreeFirst(small, isJson);
  check("a small job is answered by the free model first", free.provider === "openrouter" && free.text.includes("free") && requests.length === 0, `${free.provider} ${free.text}`);
  openAiReply = () => chat("");
  const empty = await generateFreeFirst(small, isJson);
  check("an empty free reply is never used: Gemini answers", empty.provider === "google" && empty.text.includes("gemini"), `${empty.provider} ${empty.text}`);
  openAiReply = () => chat("Sure! Here are some queries.");
  const unusable = await generateFreeFirst(small, isJson);
  check("a free reply that isn't what was asked for is not used: Gemini answers", unusable.provider === "google", unusable.provider);
  openAiReply = () => chat("Rate limit exceeded: free-models-per-day", 429);
  const limited = await generateFreeFirst(small, isJson);
  const asked = openAiBodies.length;
  const after = await generateFreeFirst(small, isJson);
  check("after the free daily limit, the free model is not asked again for a while", limited.provider === "google" && after.provider === "google" && openAiBodies.length === asked, `${openAiBodies.length} vs ${asked}`);
  delete process.env.OPENROUTER_API_KEY;
  openAiReply = null;
  scenario = null;
}
{
  // A backup that says nothing is a failure, not a blank answer.
  openAiReply = () => new Response(JSON.stringify({ model: "m", choices: [{ message: { content: "" }, finish_reason: "length" }] }), { status: 200, headers: { "content-type": "application/json" } });
  const blank = await openAiCompatibleAdapter("groq").generateCompletion({ taskType: "ad_hoc", systemInstructions: "x", prompt: "hi", model: "m" }).then(() => "answered", (e: Error) => e.message);
  check("an OpenAI-style service that gives an empty reply counts as unable to answer", /empty reply/.test(blank), blank);
  openAiReply = null;
}

// Answers are written only by the main model: no stand-in, even when it is out of allowance (owner: no compromise on quality).
{
  answerTest = true;
  setScenario((url) => (url.includes("gemini-answer-model") ? errorReply(429, "Your project has exceeded its monthly spending cap.", "RESOURCE_EXHAUSTED") : ok("Stand-in answer.")));
  const started = Date.now();
  const outcome = await googleAdapter
    .generateCompletion({ taskType: "solution", systemInstructions: "x", prompt: "Solve Q1", model: "gemini-answer-model" })
    .then((r) => `answered by ${r.model}`, (e: Error) => e.message);
  check("an answer is never written by the lighter stand-in", /spending cap/.test(outcome) && !requests.some((r) => !r.url.includes("gemini-answer-model")), `${outcome} | ${requests.map((r) => r.url.split("models/")[1]).join()}`);
  check("a spending cap is not waited out with retries", Date.now() - started < 3000 && requests.length === 1, `${Date.now() - started} ms, ${requests.length} requests`);
  answerTest = false;
  scenario = null;
}

// The free checker (NVIDIA) reads an answer first; Gemini checks again only when it finds a problem, or can't check.
{
  process.env.NVIDIA_API_KEY = "test-nvidia-key";
  const chat = (content: string, status = 200) =>
    new Response(status === 200 ? JSON.stringify({ model: "nemotron", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }) : JSON.stringify({ error: { message: content } }), { status, headers: { "content-type": "application/json" } });
  const job = { taskType: "solution" as const, question: "Q1. Who found the stone?", answer: "**Q1.** Peterson's wife.", context: "Peterson's wife found it.", photos: [] };
  setScenario(() => ok('{"problems":[{"kind":"wrong","where":"Q1","problem":"Gemini agrees it is wrong.","fix":"x"}]}'));
  openAiReply = () => chat('{"problems": []}');
  const clean = await verifyAnswer(job);
  check("the free checker's clean reading is accepted, with no Gemini call", clean?.problems.length === 0 && clean.result.provider === "nvidia" && requests.length === 0, `${clean?.result.provider} ${requests.length}`);
  openAiReply = () => chat('{"problems": [{"kind": "wrong", "where": "Q1", "problem": "Free checker doubts it.", "fix": "y"}]}');
  const doubted = await verifyAnswer(job);
  check("a problem the free checker finds is checked again by Gemini, whose reading counts", doubted?.result.provider === "google" && doubted.problems[0]?.problem === "Gemini agrees it is wrong." && requests.length === 1, `${doubted?.result.provider} ${doubted?.problems[0]?.problem}`);
  requests.length = 0;
  openAiReply = () => chat("Sorry, I can't help with that.");
  const unreadable = await verifyAnswer(job);
  check("an unreadable free reading falls back to Gemini", unreadable?.result.provider === "google" && requests.length === 1);
  requests.length = 0;
  openAiReply = () => chat("busy", 503);
  const down = await verifyAnswer(job);
  check("a free checker that can't answer falls back to Gemini", down?.result.provider === "google" && requests.length === 1);
  delete process.env.NVIDIA_API_KEY;
  openAiReply = null;
  scenario = null;
}

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
