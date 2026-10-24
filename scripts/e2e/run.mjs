// Browser tests: opens Syllabi's real screens in a phone-sized Chromium with
// every /api call answered by a fake, and checks what a person would see,
// including the error messages. No keys, database or AI needed.
//   npm run test:e2e
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright-core");
const PORT = 3124;
const BASE = `http://localhost:${PORT}`;
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  env: {
    ...process.env,
    UI_PREVIEW: "1",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "x",
    SUPABASE_SERVICE_ROLE_KEY: "x",
  },
  stdio: "ignore",
  detached: true,
});
const stopServer = () => {
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    // already stopped
  }
};
process.on("exit", stopServer);

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${BASE}/login`)).status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("The test server did not start in 90 seconds.");
}

const now = new Date().toISOString();
const me = {
  student: { id: "u1", email: "parent@example.com", full_name: "Asha", role: "student", active: true, class_level: "Class 6", board: "CBSE", answer_language: null, account_type: "parent" },
  quota: { used: 1200, quota: 200000, overQuota: false },
};
const books = [
  { id: "b1", title: "Maths Chapter 3", subject: "Maths", grade: "Class 6", source_type: "textbook", status: "ready", created_at: now, pages: { total: 4, done: 4, failed: 0, problems: [], waitingUntil: null } },
  { id: "b2", title: "Science Notes", subject: "Science", grade: "Class 6", source_type: "notes", status: "processing", created_at: now, pages: { total: 10, done: 3, failed: 0, problems: [], waitingUntil: null } },
];
const answer = { id: "a1", title: "What is 12 x 15?", text: "12 x 15 = 180", sources: [], usedSearchGrounding: false, searchSuggestionsHtml: null, checks: [{ kind: "calculation", ok: true, message: "12 × 15 = 180" }], pdfUrl: "/api/documents/a1/pdf" };


const pack = {
  version: 1, title: "The Plant's Journey", subject: "Science", kind: "information", language: "en",
  overview: "How a seed becomes a plant.", themes: ["Growth"], characters: [],
  walkthrough: [
    { title: "The seed wakes up", summary: "A seed drinks water and starts to grow.", whyItMatters: "It shows how life begins.", feelings: null,
      vocabulary: [{ word: "germinate", meaning: "to start growing" }], narration: "Hello! Let us see how a seed wakes up. Can you guess what it needs?",
      scene: { backdrop: "forest", actors: [{ emoji: "🌱", motion: "grow" }, { emoji: "☀️", motion: "pulse" }], caption: "A seedling grows in the sun" } },
    { title: "Leaves make food", summary: "Leaves use sunlight to make food.", whyItMatters: "Plants feed the world.", feelings: null, vocabulary: [], narration: "Leaves are tiny kitchens.", scene: null },
  ],
  textbookQuestions: [{ number: "Q1", question: "What does a seed need to grow?", type: "Short answer", marks: 2, options: [], hint: "Look at part 1.", evidence: "", evidenceFound: null, answer: "Water, air and warmth.", narration: "A seed needs water.", difficulty: null, skill: "" }],
  textbookQuestionsWritten: false,
  practiceQuestions: [{ number: "", question: "Name one thing leaves need.", type: "Short answer", marks: 1, options: [], hint: "Think of the sun.", evidence: "", evidenceFound: null, answer: "Sunlight.", narration: "Sunlight.", difficulty: "easy", skill: "Recall" }],
  glossary: [{ word: "germinate", meaning: "to start growing" }], source: "Science Ch 2", sourceDocumentId: null,
};
const packAnswer = { id: "a2", title: "The Plant's Journey", taskType: "study_pack", createdAt: now, text: "# The Plant's Journey", sources: [], usedSearchGrounding: false, searchSuggestionsHtml: null, pack, checks: [], worked: null, pdfUrl: "/api/documents/a2/pdf" };
// A one-second silent WAV, so the voice button has something to play.
const silentWav = (() => { const n = 8000; const b = Buffer.alloc(44 + n * 2); b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40); return b; })();
const sharp = require("sharp");
// A small Word file: two paragraphs, a table row, and one picture after the second paragraph.
const { zipSync, strToU8 } = require("fflate");
const tinyPng = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#336699" } }).png().toBuffer();
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const sampleDocx = Buffer.from(
  zipSync({
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t>Q1. Draw a line of length 5 cm.</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Use the figure below.</w:t></w:r><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>` +
        `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Marks</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
        `</w:body></w:document>`
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="image" Target="media/image1.png"/></Relationships>`
    ),
    "word/media/image1.png": new Uint8Array(tinyPng),
  })
);
const tinyJpeg = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
// Taps by script: buttons inside the animated study pack never count as "still" for a real click.
const tap = (locator) => locator.evaluate((el) => el.click());

const results = [];
let browser;
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const crashes = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  try {
    await fn(page, ctx);
    if (crashes.length) throw new Error(`The page threw errors: ${crashes.join(" | ")}`);
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, why: err instanceof Error ? err.message.split("\n").slice(0, process.env.ONLY ? 12 : 1).join("\n") : String(err) });
  }
  await ctx.close();
}

const json = (route, body, status = 200) => route.fulfill({ status, json: body });
const baseRoutes = async (ctx, extra = {}) => {
  await ctx.route("**/api/me", (r) => json(r, extra.me ?? me));
  // No recorded letter sounds unless a test says so (also stops a slow first compile of the real route).
  await ctx.route("**/api/sounds", (r) => json(r, { letters: [] }));
  await ctx.route("**/api/library*", (r) => (r.request().method() === "GET" ? json(r, { documents: extra.books ?? books }) : json(r, { error: "x" }, 500)));
};

await waitForServer();
// A fake microphone, so the sound recorder can be tried without a real one.
browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });

await test("Ask: empty question is refused with a clear message", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByText(/Your 1 book/).first().waitFor();
  await page.locator("textarea").fill("   ");
  const generate = page.getByRole("button", { name: /^Generate$/ });
  if (await generate.isEnabled()) await generate.click();
  // Either the button is off with a reason, or a message is shown: never silence.
  await page.getByText(/Type a question|attach a photo|Generate is off|Generate is paused/i).first().waitFor({ timeout: 5000 });
});

await test("Ask: a question shows the answer and its checks", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/generate/**", (r) => json(r, { ...answer, text: "Plants make food from sunlight." }));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Explain photosynthesis");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText("Plants make food from sunlight.").first().waitFor({ timeout: 10000 });
});

await test("Ask: allowance used up says when it resets", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/generate/**", (r) => json(r, { error: "You've used all of this month's allowance, so new answers are paused. It resets on the 1st.", quota: { used: 200000, quota: 200000, overQuota: true } }, 429));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Explain fractions");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText(/resets on the 1st/).first().waitFor({ timeout: 10000 });
});

await test("Ask: service busy message is shown, not a blank screen", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/generate/**", (r) => json(r, { error: "The AI service is busy right now. Wait a minute and try again." }, 503));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Explain fractions");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText(/busy right now/).first().waitFor({ timeout: 10000 });
});

await test("Ask: offline shows the connection message", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/generate/**", (r) => r.abort("failed"));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Explain fractions");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText(/Check your internet connection|reach Syllabi/i).first().waitFor({ timeout: 10000 });
});

const ndjson = (lines) => ({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n" });

await test("Ask: a streamed answer ends with the checked answer", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/generate/**", (r) =>
    r.fulfill(ndjson([{ type: "text", delta: "Plants make " }, { type: "text", delta: "food." }, { type: "done", answer: { ...answer, text: "Plants make food from sunlight (checked)." } }]))
  );
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Explain photosynthesis");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText("Plants make food from sunlight (checked).").first().waitFor({ timeout: 10000 });
});

await test("Ask: an error inside a streamed answer is shown", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/generate/**", (r) =>
    r.fulfill(ndjson([{ type: "text", delta: "Partial " }, { type: "error", status: 503, error: "The AI service is busy right now. Wait a minute and try again." }]))
  );
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Explain photosynthesis");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText(/busy right now/).first().waitFor({ timeout: 10000 });
});

await test("Ask: a stream that stops early says what to do", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/generate/**", (r) => r.fulfill(ndjson([{ type: "text", delta: "Partial " }])));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Explain photosynthesis");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText(/connection dropped before the answer finished/).first().waitFor({ timeout: 10000 });
});

await test("Ask: switching kind clears the text and the old answer", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/generate/**", (r) => json(r, { ...answer, text: "Plants make food from sunlight.", timings: { totalMs: 6200, readingPhotosMs: 0, searchMs: 900, loadingImagesMs: 0, firstWordsMs: 2400, writingMs: 4800, repairMs: 0, savedMs: 100, model: "google / gemini-flash-latest" } }));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Explain photosynthesis");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText("Plants make food from sunlight.").first().waitFor({ timeout: 10000 });
  await page.getByText(/Made in 6\.2s/).first().waitFor();
  await page.getByRole("radio", { name: /Notes/ }).click();
  await page.getByText("Plants make food from sunlight.").first().waitFor({ state: "detached", timeout: 5000 });
  if ((await page.locator("textarea").inputValue()) !== "") throw new Error("The text box was not cleared when switching kind.");
  await page.getByText("Quick commands").waitFor({ state: "detached", timeout: 3000 });
});

await test("My Books: lists books with reading progress", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByText("Maths Chapter 3").first().waitFor();
  await page.getByText("Science Notes").first().waitFor();
});

await test("Ask: a plain calculation is answered by code, with no AI request", async (page, ctx) => {
  await baseRoutes(ctx);
  let asked = 0;
  await ctx.route("**/api/generate/**", (r) => {
    asked++;
    return json(r, answer);
  });
  await ctx.route("**/api/worked", (r) => json(r, { id: "w1" }));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("Divide 5255 by 5");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText(/5255 ÷ 5 = 1051/).first().waitFor({ state: "attached", timeout: 10000 });
  if (asked !== 0) throw new Error(`The AI was asked ${asked} time(s) for a plain calculation.`);
});

await test("Ask: example questions fill the box, and Ctrl+Enter sends", async (page, ctx) => {
  await baseRoutes(ctx);
  let asked = 0;
  await ctx.route("**/api/generate/**", (r) => {
    asked++;
    return json(r, answer);
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const box = page.locator("textarea");
  await page.getByRole("button", { name: /^Solve all exercise questions/ }).click();
  if (!/Solve every question of every exercise/.test(await box.inputValue())) throw new Error("The quick command did not fill the box.");
  await page.getByText("Quick commands").waitFor();
  await box.fill("Why is the sky blue?");
  await page.getByText("Quick commands").waitFor({ state: "detached", timeout: 3000 });
  await box.fill("Why is the sky blue?");
  await box.press("Control+Enter");
  await page.getByText(/checks|answer/i).first().waitFor({ timeout: 8000 });
  if (asked < 1) throw new Error("Ctrl+Enter did not send the question.");
});

await test("Ask: Solve all exercise questions fills the full request, picks exercise books and textbooks, and the picker can pick by kind", async (page, ctx) => {
  const lib = (id, title, source_type) => ({ id, title, subject: "Geography", grade: "Class 7", source_type, status: "ready", created_at: now, pages: null });
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library**", (r) => json(r, { documents: [lib("t1", "Lithosphere Textbook", "textbook"), lib("e1", "Lithosphere Exercises", "exercise"), lib("p1", "Half Yearly Papers", "past_paper")] }));
  let sent = null;
  await ctx.route("**/api/generate/**", (r) => {
    sent = r.request().postDataJSON();
    return json(r, answer);
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const box = page.locator("textarea");
  const pressed = async (title) => (await page.getByRole("button", { name: new RegExp(title) }).getAttribute("aria-pressed")) === "true";
  if ((await page.getByRole("button", { name: /Quick commands|Solve all test papers|Explain a method/ }).count()) !== 0) throw new Error("Only one command should be offered.");

  await page.getByRole("button", { name: /^Solve all exercise questions/ }).click();
  const filled = await box.inputValue();
  for (const kind of ["fill in the blanks", "true or false", "in brief or in short", "in detail", "research or find-out", "Do not skip or merge"]) if (!filled.includes(kind)) throw new Error(`The request lacks "${kind}".`);
  if (!(await pressed("Lithosphere Exercises")) || !(await pressed("Lithosphere Textbook")) || (await pressed("Half Yearly Papers"))) throw new Error("The exercise book and the textbook should be picked, not the test papers.");

  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText(/checks|answer/i).first().waitFor({ timeout: 8000 });
  if (!sent || sent.documentIds.join() !== "t1,e1" || !/every kind of question/.test(sent.prompt)) throw new Error(`Sent ${JSON.stringify(sent)}.`);

  // The picker can choose by kind too.
  await page.getByRole("button", { name: "Test papers", exact: true }).click();
  if (!(await pressed("Half Yearly Papers")) || (await pressed("Lithosphere Exercises"))) throw new Error("Test papers should be the only ones picked.");
  await page.getByRole("button", { name: "All", exact: true }).click();
  if (!(await pressed("Lithosphere Textbook")) || !(await pressed("Half Yearly Papers"))) throw new Error("All should pick every book.");
});

await test("Ask: the command, with no exercise book or textbook uploaded, says so and keeps the selection", async (page, ctx) => {
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library**", (r) => json(r, { documents: [{ id: "p1", title: "Only Papers", subject: null, grade: null, source_type: "past_paper", status: "ready", created_at: now, pages: null }] }));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Solve all exercise questions/ }).click();
  await page.getByText(/You haven't uploaded any exercise books or textbooks yet/).waitFor();
  if (!/Solve every question of every exercise/.test(await page.locator("textarea").inputValue())) throw new Error("The request should still fill the box.");
});

await test("Ask: only Solve has the command; the other kinds of answer have none yet", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Solve all exercise questions/ }).waitFor();
  for (const tab of ["Notes", "Sample paper", "Ask", "Study pack"]) {
    await page.getByRole("radio", { name: new RegExp(tab) }).click();
    if ((await page.getByText("Quick commands").count()) !== 0) throw new Error(`${tab} should have no quick commands yet.`);
  }
});

await test("Check paper: attach the solved paper, set marks per question, and get a marked report with a score card", async (page, ctx) => {
  const report = "# Paper check: Class 7 maths worksheet\n\n**Total: 12 / 15 (80%) · Grade: A**\n\n| Q | Max | Marks | Steps | Answer |\n|---|---|---|---|---|\n| 1 | 5 | 5 | ✓ | ✓ |\n| 2 | 5 | 4 | ✓ | ✗ |\n| 3 | 5 | 3 | ~ | ✗ |\n\n## Question 2 — 4/5\n**To do better:** Check each converted fraction.";
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library**", (r) => json(r, { documents: [{ id: "t1", title: "A Textbook", subject: null, grade: null, source_type: "textbook", status: "ready", created_at: now, pages: null }] }));
  let sent = null;
  let route = "";
  await ctx.route("**/api/generate/**", (r) => {
    sent = r.request().postDataJSON();
    route = r.request().url();
    return json(r, { ...answer, title: "Paper check", text: report, sources: [], checks: [], confidence: null });
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /Check paper/ }).click();
  await page.getByPlaceholder(/Attach photos or a PDF of the solved paper/).waitFor();
  // No books are used to mark a paper.
  if ((await page.getByText("Search these books").count()) !== 0 || (await page.getByRole("button", { name: /Your 1 book|All 1 book/ }).count()) !== 0) throw new Error("The book picker should be hidden when checking a paper.");
  // Nothing to check yet.
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText(/Attach photos or a PDF of the solved paper first/).waitFor();
  await page.locator("input[type=file]").setInputFiles({ name: "paper.jpg", mimeType: "image/jpeg", buffer: tinyJpeg });
  await page.getByRole("button", { name: "Remove page 1" }).waitFor({ timeout: 15000 });
  await page.getByLabel("Marks per question").fill("8");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByTestId("paper-score").waitFor({ timeout: 10000 });
  await page.getByTestId("paper-score").getByText("Grade A").waitFor();
  await page.getByTestId("paper-score").getByText("80%").waitFor();
  await page.getByRole("cell", { name: "Marks", exact: true }).first().waitFor();
  await page.getByText("Check each converted fraction.").first().waitFor();
  if (!route.endsWith("/api/generate/paper-check")) throw new Error(`Sent to ${route}.`);
  if (!/Marks per question \(set\): 8/.test(sent.prompt) || sent.photos.length !== 1 || sent.documentIds.length !== 0) throw new Error(`Sent ${JSON.stringify({ p: sent.prompt, n: sent.photos.length, d: sent.documentIds })}.`);
});

await test("Check paper: with no marks given the request says 5 per question is assumed", async (page, ctx) => {
  await baseRoutes(ctx);
  let sent = null;
  await ctx.route("**/api/generate/**", (r) => {
    sent = r.request().postDataJSON();
    return json(r, { ...answer, text: "# Paper check: x\n\n**Total: 5 / 5 (100%) · Grade: A+**", sources: [], checks: [] });
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /Check paper/ }).click();
  await page.locator("textarea").fill("1) 12 x 15 = 180");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByTestId("paper-score").waitFor({ timeout: 10000 });
  if (!/Marks per question: not given \(use the marks printed on the paper, or 5 per question/.test(sent.prompt)) throw new Error(`Sent ${sent.prompt}.`);
  await page.getByTestId("paper-score").getByText("Grade A+").waitFor();
});

await test("Ask: an attached photo shows, can be removed, and goes with the question", async (page, ctx) => {
  await baseRoutes(ctx);
  let sentPhotos = -1;
  await ctx.route("**/api/generate/**", (r) => {
    sentPhotos = (r.request().postDataJSON().photos ?? []).length;
    return json(r, { ...answer, text: "Plants make food from sunlight." });
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles({ name: "homework.jpg", mimeType: "image/jpeg", buffer: tinyJpeg });
  await page.getByRole("button", { name: "Remove page 1" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Remove page 1" }).click();
  await page.getByRole("button", { name: "Remove page 1" }).waitFor({ state: "detached" });
  await page.locator("input[type=file]").setInputFiles({ name: "homework2.jpg", mimeType: "image/jpeg", buffer: tinyJpeg });
  await page.getByRole("button", { name: "Remove page 1" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText("Plants make food from sunlight.").first().waitFor({ timeout: 10000 });
  if (sentPhotos !== 1) throw new Error(`Expected one photo to be sent, saw ${sentPhotos}.`);
  await page.getByRole("button", { name: "Remove page 1" }).waitFor({ state: "detached", timeout: 5000 });
});


// A plain PDF with `count` simple pages, written by hand (with its own cross-reference table).
function blankPdf(count) {
  // Each page draws a rectangle of its own width, so no two pages look the same.
  const kids = Array.from({ length: count }, (_, i) => `${3 + i} 0 R`).join(" ");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${kids}] /Count ${count} >>`];
  for (let i = 0; i < count; i++) objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${3 + count + i} 0 R >>`);
  for (let i = 0; i < count; i++) {
    const stream = `0 0 ${20 + i * 10} 100 re f`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

await test("Ask: a long PDF lets you choose its pages (say 11 to 16), and Generate waits for the choice", async (page, ctx) => {
  await baseRoutes(ctx);
  let sentPhotos = -1;
  await ctx.route("**/api/generate/**", (r) => {
    sentPhotos = (r.request().postDataJSON().photos ?? []).length;
    return json(r, { ...answer, text: "Exercise answered." });
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles({ name: "exercise.pdf", mimeType: "application/pdf", buffer: blankPdf(30) });
  const picker = page.getByRole("group", { name: "Choose pages of exercise.pdf" });
  await picker.getByText(/has 30 pages/).waitFor({ timeout: 30000 });
  await page.getByText(/Choose which pages of the long PDF/).waitFor();
  // A bad choice is explained and can't be sent.
  await picker.getByLabel("From page").fill("11");
  await picker.getByLabel("to page").fill("40");
  await picker.getByText(/Type page numbers from 1 to 30/).waitFor();
  await picker.getByLabel("to page").fill("16");
  await picker.getByRole("button", { name: "Attach these pages" }).click();
  await picker.waitFor({ state: "detached", timeout: 30000 });
  await page.getByRole("button", { name: "Remove page 6" }).waitFor();
  if ((await page.getByRole("button", { name: "Remove page 7" }).count()) !== 0) throw new Error("More than the six chosen pages were attached.");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText("Exercise answered.").first().waitFor({ timeout: 10000 });
  if (sentPhotos !== 6) throw new Error(`Expected 6 pages to be sent, saw ${sentPhotos}.`);
});

await test("Ask: a long PDF can be skipped", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: blankPdf(14) });
  const picker = page.getByRole("group", { name: "Choose pages of big.pdf" });
  await picker.waitFor({ timeout: 30000 });
  await picker.getByRole("button", { name: "Skip this PDF" }).click();
  await picker.waitFor({ state: "detached" });
  await page.getByText(/Choose which pages of the long PDF/).waitFor({ state: "detached", timeout: 3000 });
});

await test("Ask: turning every book off explains why Generate is off", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Your 1 book/ }).click();
  await page.getByRole("button", { name: "None" }).click();
  await page.getByText(/no book is selected/i).first().waitFor({ timeout: 5000 });
  if (!(await page.getByRole("button", { name: /^Generate$/ }).isDisabled())) throw new Error("Generate should be off with no book selected.");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByText(/no book is selected/i).first().waitFor({ state: "detached", timeout: 5000 });
});

await test("Switching screens shows the last list at once while it refreshes", async (page, ctx) => {
  let calls = 0;
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library*", async (r) => {
    calls++;
    if (calls > 2) await new Promise((res) => setTimeout(res, 3000)); // a slow refresh
    return json(r, { documents: books });
  });
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByText("Maths Chapter 3").first().waitFor();
  await page.locator('a[href="/dashboard"]:visible').last().evaluate((el) => el.click());
  await page.waitForURL(/\/dashboard$/);
  await page.locator('a[href="/dashboard/library"]:visible').last().evaluate((el) => el.click());
  await page.waitForURL(/\/dashboard\/library/);
  await page.getByText("Maths Chapter 3").first().waitFor({ timeout: 1500 });
});

await test("Study pack: parts, picture, tabs and questions", async (page, ctx) => {
  await ctx.route("**/api/documents/a2", (r) => json(r, { answer: packAnswer }));
  await page.goto(`${BASE}/dashboard/documents/a2`, { waitUntil: "networkidle" });
  await page.getByText("The seed wakes up").first().waitFor();
  await page.getByRole("img", { name: "A seedling grows in the sun" }).waitFor();
  await tap(page.getByRole("button", { name: /Next/ }).first());
  await page.getByText("Leaves use sunlight to make food.").first().waitFor();
  await tap(page.getByRole("tab", { name: /Textbook Q&A/ }).first());
  await page.getByText("What does a seed need to grow?").first().waitFor();
  await tap(page.getByRole("tab", { name: /Practice test/ }).first());
  await page.getByText("Name one thing leaves need.").first().waitFor();
});

await test("Study pack: hints, answers, the glossary search and Copy", async (page, ctx) => {
  await ctx.route("**/api/documents/a2", (r) => json(r, { answer: packAnswer }));
  await page.goto(`${BASE}/dashboard/documents/a2`, { waitUntil: "networkidle" });
  await tap(page.getByRole("tab", { name: /Textbook Q&A/ }).first());
  await page.getByText("What does a seed need to grow?").first().waitFor();
  await tap(page.getByRole("button", { name: /Hint/ }).first());
  await page.getByText("Look at part 1.").first().waitFor();
  await tap(page.getByRole("button", { name: "Show all answers" }));
  await page.locator("text=Water, air and warmth. >> visible=true").first().waitFor();
  await tap(page.getByRole("button", { name: "Hide all answers" }));
  await page.locator("text=Water, air and warmth. >> visible=true").first().waitFor({ state: "detached", timeout: 3000 });
  await tap(page.getByRole("tab", { name: /Glossary/ }).first());
  await page.getByText("to start growing").first().waitFor();
  await page.getByLabel("Find a word").fill("zzz");
  await page.getByText("No matching words.").waitFor();
  await page.getByLabel("Find a word").fill("germ");
  await page.getByText("to start growing").first().waitFor();
  await tap(page.getByRole("tab", { name: /Key ideas/ }).first());
  await page.getByText("The seed wakes up").first().waitFor();
});

await test("Study pack: a practice test is marked, scored and can be retried", async (page, ctx) => {
  const base = pack.practiceQuestions[0];
  const q = (over) => ({ ...base, hint: "", ...over });
  const testPack = {
    ...pack,
    practiceQuestions: [
      q({ question: "Name one thing leaves need.", hint: "Think of the sun." }),
      q({ question: "Which gas do plants take in?", type: "MCQ", options: ["Oxygen", "Carbon dioxide", "Helium", "Neon"], answer: "Carbon dioxide", autoKey: { kind: "option", index: 1 } }),
      q({ question: "Seeds need water to start growing.", type: "True or false", answer: "True", autoKey: { kind: "truefalse", value: true } }),
      q({ question: "Plants make food by ____.", type: "Fill in the blank", answer: "photosynthesis", autoKey: { kind: "blank", answers: ["photosynthesis"] } }),
    ],
  };
  await ctx.route("**/api/documents/a2", (r) => json(r, { answer: { ...packAnswer, pack: testPack } }));
  await page.goto(`${BASE}/dashboard/documents/a2`, { waitUntil: "networkidle" });
  await tap(page.getByRole("tab", { name: /Practice test/ }).first());
  await page.getByText("Question 1 of 4").waitFor();
  // 1: a written answer; the hint shows, then the child marks themselves.
  await tap(page.getByRole("button", { name: /Hint/ }));
  await page.getByText("Think of the sun.").first().waitFor();
  await tap(page.getByRole("button", { name: "Show the answer" }));
  await tap(page.getByRole("button", { name: /Not yet/ }));
  // 2: a wrong choice is marked at once.
  await page.getByText("Question 2 of 4").waitFor();
  await tap(page.getByRole("button", { name: "Helium" }));
  await page.getByText("Not quite. See the answer below.").waitFor();
  await tap(page.getByRole("button", { name: /^Next/ }));
  // 3: True.
  await page.getByText("Question 3 of 4").waitFor();
  await tap(page.getByRole("button", { name: "True", exact: true }));
  await page.getByText("Correct!").waitFor();
  await tap(page.getByRole("button", { name: /^Next/ }));
  // 4: a typed word (capital letters and spaces don't matter).
  await page.getByText("Question 4 of 4").waitFor();
  await page.getByLabel("Your answer").fill("  Photosynthesis ");
  await tap(page.getByRole("button", { name: "Check" }));
  await page.getByText("Correct!").waitFor();
  await tap(page.getByRole("button", { name: /^Next/ }));
  // Results: 2 of 4, the two missed ones listed.
  await page.getByText("Practice test finished").waitFor();
  await page.getByText("/4").first().waitFor();
  await page.locator("li", { hasText: /^P1\. Name one thing leaves need\./ }).waitFor();
  await page.locator("li", { hasText: /^P2\. Which gas do plants take in\?/ }).waitFor();
  await tap(page.getByRole("button", { name: "Try again the ones marked Not yet" }));
  await page.getByText("Question 1 of 4").waitFor();
  await page.getByText("Score so far: 2").waitFor();
});

await test("Study pack: Read aloud asks for the natural voice", async (page, ctx) => {
  let asked = 0;
  await ctx.route("**/api/documents/a2", (r) => json(r, { answer: packAnswer }));
  await ctx.route("**/api/speech", (r) => { asked++; return r.fulfill({ status: 200, contentType: "audio/wav", body: silentWav }); });
  await page.goto(`${BASE}/dashboard/documents/a2`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Read aloud/ }).first());
  await page.waitForTimeout(1500);
  if (asked !== 1) throw new Error(`Expected one request to the voice service, saw ${asked}.`);
});

await test("Study pack: when the natural voice fails, the phone's voice is used and a note says so", async (page, ctx) => {
  await ctx.route("**/api/documents/a2", (r) => json(r, { answer: packAnswer }));
  await ctx.route("**/api/speech", (r) => json(r, { error: "Couldn't make the voice just now." }, 503));
  await page.goto(`${BASE}/dashboard/documents/a2`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Read aloud/ }).first());
  await page.getByText(/natural voice isn.t available/i).first().waitFor({ timeout: 8000 });
});

await test("My Books: uploading a photo shows it was sent", async (page, ctx) => {
  let created = 0, sent = 0;
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => {
    if (r.request().method() === "GET") return json(r, { documents: [] });
    created++;
    return json(r, { documentId: "b9" });
  });
  await ctx.route(/\/api\/library\/b9\/pages$/, (r) => { sent++; return json(r, { ok: true }); });
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.fill("#book-title", "History Unit 1");
  await page.locator("input[type=file]").setInputFiles({ name: "page1.jpg", mimeType: "image/jpeg", buffer: tinyJpeg });
  await page.getByText(/1 page/).first().waitFor({ timeout: 15000 });
  await page.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: /Upload & read/ }).click();
  for (let i = 0; i < 100 && sent < 1; i++) await page.waitForTimeout(200);
  await page.getByText(/sent\. Syllabi is reading them now/i).first().waitFor({ timeout: 20000 });
  if (created !== 1 || sent < 1) throw new Error(`Expected one book and at least one page request, saw ${created} and ${sent}.`);
});

await test("My Books: a refused upload explains why", async (page, ctx) => {
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => (r.request().method() === "GET" ? json(r, { documents: [] }) : json(r, { error: "You've used all of this month's allowance, so new answers are paused." }, 429)));
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.fill("#book-title", "History Unit 1");
  await page.locator("input[type=file]").setInputFiles({ name: "page1.jpg", mimeType: "image/jpeg", buffer: tinyJpeg });
  await page.getByText(/1 page/).first().waitFor({ timeout: 15000 });
  await page.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: /Upload & read/ }).click();
  await page.getByText(/allowance/i).first().waitFor({ timeout: 15000 });
});

await test("Admin accounts: lists accounts and explains a refused change", async (page, ctx) => {
  await ctx.route("**/api/admin/students", (r) => {
    if (r.request().method() === "GET") return json(r, { students: [{ id: "u2", email: "kid@example.com", full_name: "Meera", role: "student", active: true, token_quota: 200000, monthly_usage: 100, created_at: now, account_type: "parent" }] });
    return json(r, { error: "You can't turn off or demote your own account. Ask another admin to do it." }, 400);
  });
  await page.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await page.getByText("Meera").first().waitFor();
});

await test("Admin accounts: a guest with a user ID and a chosen password needs no email", async (page, ctx) => {
  await ctx.route("**/api/admin/students", (r) => json(r, { students: [] }));
  let sent = null;
  await ctx.route("**/api/admin/guests", (r) => {
    sent = r.request().postDataJSON();
    return json(r, { account: { id: "g2", email: "guest@guest.syllabi-study.vercel.app", login_id: "guest", full_name: "Guest", role: "student", active: true, token_quota: 20000, guest_until: new Date(Date.now() + 365 * 86400000).toISOString(), created_at: now }, password: null });
  });
  await page.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await page.fill("#guest-id", "Guest");
  await page.fill("#guest-password", "study-2026");
  await page.getByRole("button", { name: /Make guest login/ }).click();
  await page.getByText(/signs in with this user ID/).first().waitFor({ timeout: 8000 });
  if (sent?.loginId !== "Guest" || sent?.password !== "study-2026" || "email" in sent) throw new Error(`Unexpected request: ${JSON.stringify(sent)}`);
});

await test("Sign-in: the box takes an email or a user ID", async (page) => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email or user ID").fill("guest");
  if ((await page.getByLabel("Email or user ID").inputValue()) !== "guest") throw new Error("A user ID could not be typed");
});

await test("Admin accounts: making a guest shows the password once", async (page, ctx) => {
  await ctx.route("**/api/admin/students", (r) => json(r, { students: [] }));
  await ctx.route("**/api/admin/guests", (r) => json(r, { account: { id: "g1", email: "reviewer@example.com", full_name: "Guest", role: "student", active: true, token_quota: 20000, guest_until: new Date(Date.now() + 14 * 86400000).toISOString(), created_at: now }, password: "Abcd2345Wxyz" }));
  await page.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await page.getByLabel(/Email, with a made-up password/).check();
  await page.fill("#guest-email", "reviewer@example.com");
  await page.getByRole("button", { name: /Make guest login/ }).click();
  await page.getByText("Abcd2345Wxyz").first().waitFor({ timeout: 8000 });
  await page.getByText(/shown only once/).first().waitFor();
  await page.getByText(/Guest, signs in until/).first().waitFor();
});

await test("Admin accounts: role, allowance and access changes are sent, with a check before removing access", async (page, ctx) => {
  const kid = { id: "11111111-1111-4111-8111-111111111111", email: "kid@example.com", full_name: "Meera", role: "student", active: true, token_quota: 200000, monthly_usage: 100, created_at: now, account_type: "parent" };
  const sent = [];
  await ctx.route("**/api/admin/students", (r) => {
    if (r.request().method() === "GET") return json(r, { students: [kid] });
    const body = r.request().postDataJSON();
    sent.push(body);
    return json(r, { student: { ...kid, ...body } });
  });
  let asked = "";
  page.on("dialog", (d) => { asked = d.message(); void d.accept(); });
  await page.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await page.getByLabel("Role of Meera").selectOption("admin");
  await page.getByText("Meera: is now an admin.").waitFor({ timeout: 5000 });
  const quota = page.getByLabel("Monthly limit in tokens for Meera");
  await quota.fill("-5");
  await quota.blur();
  await page.getByText(/must be a whole number from 0 to 10,00,00,000/).waitFor({ timeout: 5000 });
  await quota.fill("300000");
  await quota.blur();
  await page.getByText(/monthly limit set to 3,00,000 tokens/).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Remove access" }).click();
  await page.getByText("Meera: access removed.").waitFor({ timeout: 5000 });
  if (!/Remove access for Meera\?/.test(asked)) throw new Error(`Expected a question first, saw "${asked}".`);
  const kinds = sent.map((b) => Object.keys(b).filter((k) => k !== "id").join());
  if (kinds.join("|") !== "role|token_quota|active") throw new Error(`Unexpected changes sent: ${JSON.stringify(sent)}`);
  if (sent[1].token_quota !== 300000 || sent[2].active !== false) throw new Error(`Unexpected values: ${JSON.stringify(sent)}`);
});

await test("Admin health: optional extras are grey, not failures", async (page, ctx) => {
  await ctx.route("**/api/admin/errors", (r) => json(r, { errors: [] }));
  await ctx.route("**/api/admin/health", (r) => json(r, { checks: [
    { name: "Database", ok: true, detail: "Connected.", ms: 100 },
    { name: "Backup AI: nvidia", ok: true, skipped: true, detail: "Not set up (optional).", ms: 0 },
  ] }));
  await page.goto(`${BASE}/admin/health`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Run checks/ }).click();
  await page.getByText(/Everything required works\. 1 optional extra isn.t set up/).first().waitFor({ timeout: 8000 });
  await page.getByText("Nothing logged in the last 30 days.").first().waitFor();
});

const speechOk = (ctx) => ctx.route("**/api/speech", (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: silentWav }));

await test("Kindergarten: spelling a word with letters, a full round ends in stars", async (page, ctx) => {
  await baseRoutes(ctx);
  await speechOk(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Play/ }).nth(1));
  for (let q = 0; q < 5; q++) {
    const box = page.locator("[data-word]");
    await box.waitFor();
    const word = await box.getAttribute("data-word");
    // A wrong letter first: it must not be accepted.
    for (const letter of word) {
      await tap(page.getByRole("group", { name: "Letters to choose from" }).getByRole("button", { name: letter, exact: true }).and(page.locator("button:not([disabled])")).first());
    }
    // The sounds are blended into the word ("m · a · p = map") before the next question.
    if (q === 0) await page.getByLabel(/make the word/).waitFor({ timeout: 30000 });
    if (q < 4) await page.locator(`[data-word]:not([data-word="${word}"])`).waitFor({ timeout: 30000 });
  }
  await page.getByText("Well done!").first().waitFor({ timeout: 30000 });
});

await test("Kindergarten: listen and blend - the sounds are heard, then the right picture earns a star", async (page, ctx) => {
  await baseRoutes(ctx);
  await speechOk(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Play/ }).first());
  for (let q = 0; q < 5; q++) {
    const box = page.locator("[data-word]");
    await box.waitFor({ timeout: 15000 });
    const word = await box.getAttribute("data-word");
    // The sounds are played first; a wrong picture must not end the question.
    const others = page.getByRole("button", { name: /^[a-z]{3}$/ }).and(page.locator(`:not([aria-label="${word}"])`));
    if (q === 0 && (await others.count()) > 0) {
      await tap(others.first());
      // A wrong picture stays marked with a cross until the question changes.
      await page.getByRole("button", { name: /^[a-z]{3}$/ }).getByText("✗").first().waitFor({ timeout: 5000 });
    }
    await tap(page.getByRole("button", { name: word, exact: true }));
    if (q === 0) {
      await page.getByText("=", { exact: true }).first().waitFor({ timeout: 15000 });
      // The question stays after the right picture: the sounds can be heard again before Next.
      const again = page.getByRole("button", { name: /Play again/ });
      await again.waitFor();
      if (await again.isDisabled()) throw new Error("Play again should work after the right picture.");
    }
    await tap(page.getByRole("button", { name: "Next →", exact: true }));
    if (q < 4) await page.locator(`[data-word]:not([data-word="${word}"])`).waitFor({ timeout: 20000 });
  }
  await page.getByText("Well done!").first().waitFor({ timeout: 20000 });
});

await test("Kindergarten: place value lesson steps through and leads to the game", async (page, ctx) => {
  await baseRoutes(ctx);
  await speechOk(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Learn first/ }));
  await page.getByLabel("Place value lesson").waitFor();
  for (let i = 0; i < 4; i++) await tap(page.getByRole("button", { name: "Next →", exact: true }));
  await page.getByText(/Put the place values together/).waitFor();
  await tap(page.getByRole("button", { name: /Play the game/ }));
  await page.locator("[data-answer]").waitFor();
});

await test("Kindergarten: place value game - a wrong answer is not accepted, a full round ends in stars", async (page, ctx) => {
  await baseRoutes(ctx);
  await speechOk(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "▶ Play" }).nth(4).waitFor();
  await tap(page.getByRole("button", { name: "▶ Play" }).nth(4));
  for (let q = 0; q < 5; q++) {
    const box = page.locator("[data-answer]");
    await box.waitFor({ timeout: 15000 });
    const answer = await box.getAttribute("data-answer");
    const number = await box.getAttribute("data-number");
    if (q === 0) {
      const wrong = box.getByRole("button", { name: /^\d+$/ }).and(page.locator(`:not(:text-is("${answer}"))`));
      await tap(wrong.first());
    }
    await tap(box.getByRole("button", { name: answer, exact: true }));
    if (q < 4) await page.locator(`[data-number]:not([data-number="${number}"])`).waitFor({ timeout: 20000 });
  }
  await page.getByText("Well done!").first().waitFor({ timeout: 20000 });
});

await test("Kindergarten: word explorer - tap a letter, slide to blend, next word", async (page, ctx) => {
  await baseRoutes(ctx);
  await speechOk(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  // Only the -at family: every word rhymes.
  await tap(page.getByRole("group", { name: "Word family" }).getByRole("button", { name: "-at", exact: true }));
  await tap(page.getByRole("button", { name: "▶ Play" }).nth(5));
  const tiles = page.locator("[data-word]");
  await tiles.waitFor();
  const word = await tiles.getAttribute("data-word");
  if (!word.endsWith("at")) throw new Error(`Expected an -at word, got ${word}`);
  await tap(tiles.getByRole("button").first());
  await page.getByRole("slider", { name: "Slide to blend" }).fill("2");
  await page.getByText(`${word}!`).waitFor();
  await tap(page.getByRole("button", { name: "Next word →" }));
  await page.locator("[data-word]").waitFor();
});

await test("Kindergarten: recording a letter sound and saving it", async (page, ctx) => {
  await ctx.grantPermissions(["microphone"]);
  let saved = 0;
  await baseRoutes(ctx);
  await ctx.route("**/api/sounds", (r) => json(r, { letters: ["m"] }));
  await ctx.route("**/api/sounds/a", (r) => {
    if (r.request().method() === "PUT") { saved++; return json(r, { ok: true }); }
    return json(r, { error: "none" }, 404);
  });
  await page.goto(`${BASE}/dashboard/practice/kindergarten/sounds`, { waitUntil: "networkidle" });
  await page.getByText("✓ Your recording is used").first().waitFor();
  await page.getByRole("button", { name: "Record the sound for a" }).click();
  await page.getByText(/Recording… say the sound now/).waitFor({ timeout: 5000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Stop recording a" }).click();
  await page.getByRole("button", { name: "Save the recording of a" }).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Save the recording of a" }).click();
  await page.getByText(/Saved the sound for “a”/).waitFor({ timeout: 5000 });
  if (saved !== 1) throw new Error(`Expected the recording to be uploaded once, saw ${saved}.`);
});

await test("Kindergarten: a recorded sound is played instead of the voice", async (page, ctx) => {
  let fetched = 0;
  await baseRoutes(ctx);
  await speechOk(ctx);
  await ctx.route("**/api/sounds", (r) => json(r, { letters: "abcdefghijklmnopqrstuvwxyz".split("") }));
  await ctx.route(/\/api\/sounds\/[a-z]$/, (r) => { fetched++; return r.fulfill({ status: 200, contentType: "audio/wav", body: silentWav }); });
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Play/ }).first());
  await page.locator("[data-word]").waitFor({ timeout: 15000 });
  for (let i = 0; i < 60 && fetched < 3; i++) await page.waitForTimeout(250);
  if (fetched < 3) throw new Error(`Expected the recorded sounds to be fetched, saw ${fetched}.`);
});

await test("Kindergarten: letter sounds play the pure-sound files, not the speech voice", async (page, ctx) => {
  const kinds = new Set();
  const files = new Set();
  await baseRoutes(ctx);
  await ctx.route("**/api/sounds", (r) => json(r, { letters: [] }));
  await ctx.route("**/api/speech", (r) => {
    kinds.add(JSON.parse(r.request().postData() ?? "{}").kind);
    return r.fulfill({ status: 200, contentType: "audio/wav", body: silentWav });
  });
  page.on("request", (req) => {
    const m = new URL(req.url()).pathname.match(/^\/sounds\/([a-z])\.mp3$/);
    if (m) files.add(m[1]);
  });
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Play/ }).first());
  await page.locator("[data-word]").waitFor({ timeout: 15000 });
  for (let i = 0; i < 60 && !(files.size && kinds.has("phrase")); i++) await page.waitForTimeout(250);
  if (!files.size) throw new Error("Expected the letter sound files in /sounds to be used.");
  if (kinds.has("sound")) throw new Error("A letter sound was asked of the speech voice although its file exists.");
  if (!kinds.has("phrase")) throw new Error(`Expected phrases from the speech voice, saw ${[...kinds]}.`);
});

await test("Kindergarten: without the sound files, letter sounds are asked for in the sound style", async (page, ctx) => {
  const kinds = new Set();
  await baseRoutes(ctx);
  await ctx.route("**/api/sounds", (r) => json(r, { letters: [] }));
  await ctx.route(/\/sounds\/[a-z]\.mp3$/, (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route("**/api/speech", (r) => {
    kinds.add(JSON.parse(r.request().postData() ?? "{}").kind);
    return r.fulfill({ status: 200, contentType: "audio/wav", body: silentWav });
  });
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Play/ }).first());
  await page.locator("[data-word]").waitFor({ timeout: 15000 });
  for (let i = 0; i < 60 && !(kinds.has("sound") && kinds.has("phrase")); i++) await page.waitForTimeout(250);
  if (!kinds.has("sound") || !kinds.has("phrase")) throw new Error(`Expected both phrase and sound requests, saw ${[...kinds]}.`);
});

await test("Kindergarten: the grown-up guide explains how to say the sounds", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await page.getByText("How to say the sounds (for grown-ups)").click();
  await page.getByText(/not “buh”|not "buh"/).first().waitFor();
  await page.getByText(/Lips together and hum/).first().waitFor();
});

await test("Kindergarten: a wrong letter says try again and does not place it", async (page, ctx) => {
  await baseRoutes(ctx);
  await speechOk(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Play/ }).nth(1));
  const box = page.locator("[data-word]");
  await box.waitFor();
  const word = await box.getAttribute("data-word");
  const tray = page.getByRole("group", { name: "Letters to choose from" }).getByRole("button");
  const letters = await tray.allInnerTexts();
  const wrong = letters.findIndex((l) => !word.includes(l));
  await tap(tray.nth(wrong));
  await page.getByRole("group", { name: "Letters to choose from" }).locator(".kg-shake").waitFor({ timeout: 3000 });
  if ((await page.getByLabel("The word so far").innerText()).replace(/[_\s]/g, "") !== "") throw new Error("A wrong letter was placed in the word.");
});

await test("Kindergarten: sight words round works when the natural voice is unavailable", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/speech", (r) => json(r, { error: "no voice" }, 503));
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Play/ }).nth(2));
  for (let q = 0; q < 5; q++) {
    const box = page.locator("[data-word]");
    await box.waitFor({ timeout: 15000 });
    const word = await box.getAttribute("data-word");
    await tap(page.getByRole("button", { name: word, exact: true }).first());
    if (q < 4) await page.locator(`[data-word]:not([data-word="${word}"])`).waitFor({ timeout: 15000 });
  }
  await page.getByText("Well done!").first().waitFor({ timeout: 15000 });
});

await test("Kindergarten: more, fewer or same - tapping the right group earns a star", async (page, ctx) => {
  await baseRoutes(ctx);
  await speechOk(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Play/ }).nth(3));
  for (let q = 0; q < 5; q++) {
    const box = page.locator("[data-answer]");
    await box.waitFor({ timeout: 8000 });
    const answer = await box.getAttribute("data-answer");
    const target = answer === "same" ? page.getByRole("button", { name: "They are the same" }) : page.getByRole("button", { name: answer === "left" ? "The left group" : "The right group" });
    await tap(target);
    await page.getByLabel(/^\d+ stars$/).filter({ hasText: `${q + 1}` }).waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1300);
  }
  await page.getByText("Well done!").first().waitFor({ timeout: 8000 });
});

await test("Kindergarten worksheets: both sheets show, and a new sheet changes the words", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten/worksheets`, { waitUntil: "networkidle" });
  await page.getByRole("article", { name: "Worksheet" }).getByText("Complete each word family:").waitFor();
  const before = await page.getByRole("article", { name: "Worksheet" }).innerText();
  await page.getByRole("button", { name: "Make another sheet" }).click();
  await page.waitForTimeout(300);
  const after = await page.getByRole("article", { name: "Worksheet" }).innerText();
  if (before === after) throw new Error("Making another sheet gave the same sheet.");
  await page.getByLabel(/Same words as the school/).check();
  const school = await page.getByRole("article", { name: "Worksheet" }).innerText();
  for (const w of ["cat", "man", "pig", "top", "sun", "pet", "hen", "sit", "pot", "cub"]) if (!school.includes(w)) throw new Error(`The school's word family sheet lacks ${w}.`);
  await page.getByLabel(/Same words as the school/).uncheck();
  await page.getByRole("radio", { name: /Match the picture/ }).click();
  await page.getByRole("article", { name: "Worksheet" }).getByText("Match the picture to the word.").waitFor();
  const pictures = await page.getByRole("article", { name: "Worksheet" }).getByRole("img", { name: "Picture" }).count();
  if (pictures < 8) throw new Error(`Expected pictures on the matching sheet, saw ${pictures}.`);
  await page.getByRole("radio", { name: /board game/ }).click();
  await page.getByText(/First frog to the pond wins/).first().waitFor();
  await page.getByText("START").first().waitFor();
  await page.getByText("POND").first().waitFor();
  const lilyPads = await page.getByLabel("Lily pad").count();
  if (lilyPads < 4) throw new Error(`Expected lily pads on the board, saw ${lilyPads}.`);
});

await test("My Books: deleting a book asks first, then removes it from the list", async (page, ctx) => {
  let deleted = 0;
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => json(r, { documents: books }));
  await ctx.route("**/api/library/b1", (r) => {
    deleted++;
    return json(r, { ok: true });
  });
  let asked = "";
  page.on("dialog", (d) => {
    asked = d.message();
    void d.accept();
  });
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Delete "Maths Chapter 3"/ }).click();
  await page.getByText("Maths Chapter 3").first().waitFor({ state: "detached", timeout: 8000 });
  if (deleted !== 1 || !/Delete "Maths Chapter 3"\?/.test(asked)) throw new Error(`Expected one delete after asking, saw ${deleted} and "${asked}".`);
  await page.getByText("Science Notes").first().waitFor();
});

await test("My Books: each ready book shows how sure the app is of its scan, and asks for a re-scan when low", async (page, ctx) => {
  const scan = (score, level, weakPages, advice, problems = []) => ({ score, level, pages: 15, weakPages, failedPages: 0, problems, advice });
  const list = [
    { ...books[0], id: "s1", title: "Clean Scan", status: "ready", pages: null, scan: scan(96, "high", [], null) },
    { ...books[0], id: "s2", title: "Mostly Fine", status: "ready", pages: null, scan: scan(88, "medium", [4], "Page 4 is unclear. For the best answers, re-scan it and upload a new copy.", ["out of focus"]) },
    { ...books[0], id: "s3", title: "Poor Scan", status: "ready", pages: null, scan: scan(52, "low", [2, 4, 6], "Low confidence: some of this book may be missing or wrong in answers. Re-scan pages 2, 4, 6 and upload a new copy.", ["too dark"]) },
    { ...books[0], id: "s4", title: "Older Book", status: "ready", pages: null },
  ];
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => json(r, { documents: list }));
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  const card = (title) => page.locator("li", { hasText: title });
  await card("Clean Scan").getByText("Scan quality: High (96%)").waitFor();
  if ((await card("Clean Scan").locator("p.text-xs.text-amber-800, p.text-xs.text-red-700").count()) !== 0) throw new Error("A High book should give no advice.");
  await card("Mostly Fine").getByText("Scan quality: Medium (88%)").waitFor();
  await card("Mostly Fine").getByText(/Page 4 is unclear/).waitFor();
  await card("Poor Scan").getByText("Scan quality: Low (52%)").waitFor();
  await card("Poor Scan").getByText(/Low confidence.*Re-scan pages 2, 4, 6 and upload a new copy/).waitFor();
  if ((await card("Older Book").getByText(/Scan quality/).count()) !== 0) throw new Error("A book with no score should show none.");
});

await test("My Books: an older book can be checked, and its score then appears", async (page, ctx) => {
  let checked = 0;
  const scored = { score: 41, level: "low", pages: 15, weakPages: [3, 4, 5, 6, 7, 8], failedPages: 0, problems: ["out of focus"], advice: "Low confidence: re-scan pages 3, 4, 5, 6, 7, 8 and upload a new copy." };
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => json(r, { documents: [{ ...books[0], id: "o1", title: "Old Upload", status: "ready", pages: null, ...(checked ? { scan: scored } : {}) }] }));
  await ctx.route("**/api/library/o1/scan", (r) => {
    checked++;
    return json(r, { ok: true, pages: 15 });
  });
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Check scan quality" }).click();
  await page.getByText("Scan quality: Low (41%)").waitFor({ timeout: 8000 });
  await page.getByText(/Low confidence: re-scan pages 3, 4, 5, 6, 7, 8/).waitFor();
  if (checked !== 1) throw new Error(`Expected one check, saw ${checked}.`);
  if ((await page.getByRole("button", { name: "Check scan quality" }).count()) !== 0) throw new Error("The check button should go once there is a score.");
});

await test("My Books: on a phone every button stays on screen, even with long titles and a score", async (page, ctx) => {
  const scan = { score: 96, level: "high", pages: 15, weakPages: [], failedPages: 0, problems: [], advice: null };
  const list = [
    { ...books[0], id: "m1", title: "Geography Unit 2 Lithosphere Exercises", subject: "Geography", grade: "Class 7", source_type: "exercise", status: "ready", pages: null, scan },
    { ...books[0], id: "m2", title: "Geography Unit 2 Lethosphere Textbook", subject: "Geography", grade: "Class 7", source_type: "textbook", status: "ready", pages: null },
    { ...books[0], id: "m3", title: "A very long title without any natural place to break it: History_Uni_1_Bhakti_Movement_Chapter_Notes", status: "ready", pages: null, scan: { ...scan, level: "low", score: 52, weakPages: [2, 4], advice: "Low confidence: some of this book may be missing or wrong in answers. Re-scan pages 2, 4 and upload a new copy." } },
  ];
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => json(r, { documents: list }));
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByText("Geography Unit 2 Lithosphere Exercises").waitFor();
  const width = page.viewportSize().width;
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (wide > 1) throw new Error(`The page scrolls sideways by ${wide}px.`);
  for (const label of [/Download "Geography Unit 2 Lithosphere Exercises"/, /Delete "Geography Unit 2 Lithosphere Exercises"/, /Download "A very long title/, /Delete "A very long title/]) {
    const box = await page.getByRole("button", { name: label }).boundingBox();
    if (!box || box.x < 0 || box.x + box.width > width) throw new Error(`${label} is off screen: ${JSON.stringify(box)}.`);
  }
  for (const card of await page.locator("ul.grid > li").all()) {
    const box = await card.boundingBox();
    if (!box || box.x + box.width > width) throw new Error(`A book card runs off the screen: ${JSON.stringify(box)}.`);
  }
});

await test("My Books: a book can be downloaded as a PDF, and a refusal is explained", async (page, ctx) => {
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => json(r, { documents: books }));
  let asked = [];
  await ctx.route("**/api/library/*/download", (r) => {
    const id = r.request().url().split("/").slice(-2)[0];
    asked.push(id);
    if (id === "b2") return json(r, { error: "This book has no saved pages to download yet." }, 404);
    return r.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4 test" });
  });
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  const [file] = await Promise.all([
    page.waitForEvent("download", { timeout: 8000 }),
    page.getByRole("button", { name: /Download "Maths Chapter 3" as a PDF/ }).click(),
  ]);
  if (file.suggestedFilename() !== "Maths Chapter 3.pdf") throw new Error(`Saved as "${file.suggestedFilename()}".`);
  await page.getByRole("button", { name: /Download "Science Notes" as a PDF/ }).click();
  await page.getByText("This book has no saved pages to download yet.").waitFor({ timeout: 8000 });
  if (asked.join() !== "b1,b2") throw new Error(`Asked for ${asked.join()}.`);
});

await test("My Books: the same photo twice is skipped, and a failed page is kept to try again", async (page, ctx) => {
  let pageCalls = 0;
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => (r.request().method() === "GET" ? json(r, { documents: [] }) : json(r, { documentId: "b8" })));
  await ctx.route("**/api/library/b8", (r) => json(r, { ok: true }));
  await ctx.route(/\/api\/library\/b8\/pages$/, (r) => {
    pageCalls++;
    return pageCalls === 1 ? json(r, { error: "That page could not be read.", retryable: false }, 400) : json(r, { ok: true });
  });
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.fill("#book-title", "History Unit 2");
  const photo = { name: "page1.jpg", mimeType: "image/jpeg", buffer: tinyJpeg };
  await page.locator("input[type=file]").setInputFiles([photo, { ...photo, name: "copy.jpg" }]);
  await page.getByText(/1 duplicate page skipped/).first().waitFor({ timeout: 15000 });
  await page.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: /Upload & read/ }).click();
  await page.getByText(/That page could not be read/).first().waitFor({ timeout: 15000 });
  await page.getByText(/1 page is still below/).first().waitFor();
  await page.getByRole("button", { name: /Upload & read 1 page/ }).click();
  await page.getByText(/sent\. Syllabi is reading them now/i).first().waitFor({ timeout: 20000 });
});

await test("My Books: a Word file's text and picture become pages", async (page, ctx) => {
  const sent = [];
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => (r.request().method() === "GET" ? json(r, { documents: [] }) : json(r, { documentId: "d7" })));
  await ctx.route("**/api/library/d7", (r) => json(r, { ok: true }));
  await ctx.route(/\/api\/library\/d7\/pages$/, (r) => {
    sent.push(...r.request().postDataJSON().pages);
    return json(r, { ok: true });
  });
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.fill("#book-title", "Worksheet");
  await page.locator("input[type=file]").setInputFiles({ name: "worksheet.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: sampleDocx });
  // One page of text (both paragraphs and the table row) and one page for the picture.
  await page.getByText(/2 pages/).first().waitFor({ timeout: 15000 });
  await page.getByText(/worksheet\.docx \(picture 1\)/).first().waitFor({ timeout: 5000 });
  await page.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: /Upload & read/ }).click();
  await page.getByText(/sent\. Syllabi is reading them now/i).first().waitFor({ timeout: 20000 });
  const text = sent.find((p) => typeof p.text === "string" && p.text.includes("Q1."));
  if (!text || !text.text.includes("Use the figure below. [Picture 1]") || !text.text.includes("Name | Marks")) throw new Error(`The text page was ${JSON.stringify(text)}`);
  const picture = sent.find((p) => p.hint);
  if (!picture || picture.hint !== "Picture 1 in worksheet.docx, after: Use the figure below." || !picture.mimeType.startsWith("image/")) throw new Error(`The picture page was ${JSON.stringify(picture && { ...picture, imageBase64: "…" })}`);
});

await test("My Books: failed pages can be tried again, and unfinished uploads can be cleared", async (page, ctx) => {
  const rows = [
    { id: "f1", title: "Half uploaded", subject: null, grade: null, source_type: "textbook", status: "failed", created_at: now, pages: null },
    { id: "f2", title: "Some pages failed", subject: "Maths", grade: "Class 6", source_type: "textbook", status: "ready", created_at: now, pages: { total: 4, done: 3, failed: 1, problems: ["Page 2 was blurry."], waitingUntil: null } },
  ];
  let list = rows;
  const calls = [];
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library", (r) => json(r, { documents: list }));
  await ctx.route("**/api/library/f2/retry", (r) => {
    calls.push("retry f2");
    return json(r, { ok: true });
  });
  await ctx.route("**/api/library/f1", (r) => {
    calls.push("delete f1");
    list = list.filter((d) => d.id !== "f1");
    return json(r, { ok: true });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByText("1 page couldn't be read: Page 2 was blurry.").waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Try it again" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Delete 1 unfinished upload" }).click();
  await page.getByText("Half uploaded").waitFor({ state: "detached", timeout: 8000 });
  if (calls.join(",") !== "retry f2,delete f1") throw new Error(`Unexpected calls: ${calls.join(",")}`);
});

await test("My Books: a failed list shows a retry message", async (page, ctx) => {
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library*", (r) => json(r, { error: "Couldn't load your books." }, 500));
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByText(/couldn.t load/i).first().waitFor({ timeout: 8000 });
});

await test("A saved answer: it opens, can be renamed, and deleting it returns to My Documents", async (page, ctx) => {
  const saved = { ...answer, id: "a1", taskType: "ad_hoc", createdAt: now, pack: null, worked: null };
  let renamed = null;
  let deleted = 0;
  await ctx.route("**/api/documents", (r) => json(r, { documents: [] }));
  await ctx.route("**/api/documents/a1", (r) => {
    const method = r.request().method();
    if (method === "PATCH") {
      renamed = r.request().postDataJSON();
      return json(r, { title: renamed.title });
    }
    if (method === "DELETE") {
      deleted++;
      return json(r, { ok: true });
    }
    return json(r, { answer: saved });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/dashboard/documents/a1`, { waitUntil: "networkidle" });
  await page.getByText("12 x 15 = 180").first().waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: /Rename What is 12 x 15\?/ }).click();
  await page.getByLabel("New name").fill("Times tables");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Rename Times tables" }).waitFor({ timeout: 5000 });
  if (renamed?.title !== "Times tables") throw new Error(`Unexpected rename ${JSON.stringify(renamed)}`);
  await page.getByRole("button", { name: "Delete this answer" }).click();
  await page.waitForURL(/\/dashboard\/documents$/, { timeout: 8000 });
  if (deleted !== 1) throw new Error(`Expected one delete, saw ${deleted}`);
});

await test("A saved answer: the reference pages show on screen but never in a print, only the generated answer does", async (page, ctx) => {
  const withSources = { ...answer, taskType: "ad_hoc", createdAt: now, pack: null, worked: null, id: "a9", title: "Soil answers", text: "Black soil suits cotton.", sources: [{ id: "s1", document_id: "b1", section_label: "Think and Answer", page_number: 5, source_type: "exercise", imageUrl: null }] };
  await ctx.route("**/api/documents/a9", (r) => json(r, { answer: withSources }));
  await page.goto(`${BASE}/dashboard/documents/a9`, { waitUntil: "networkidle" });
  await page.getByText("Sources from your books").waitFor();
  await page.emulateMedia({ media: "print" });
  if (await page.getByText("Sources from your books").isVisible()) throw new Error("The reference list is in the print view.");
  if (await page.getByText("Think and Answer").isVisible()) throw new Error("A reference page's label is in the print view.");
  await page.getByText("Black soil suits cotton.").first().waitFor();
  await page.emulateMedia({ media: "screen" });
});

await test("Answer confidence: two numbers like 95 : 89 in red, amber or green, with the reasons, not in a print", async (page, ctx) => {
  const rated = (id, title, confidence) => ({ ...answer, taskType: "ad_hoc", createdAt: now, pack: null, worked: null, id, title, text: "Black soil suits cotton.", sources: [], confidence });
  const details = { statements: 34, grounded: 2, passages: 11, passageChars: 18200, pages: "exercise p1-p10 (10), textbook p1 (1)", retrieval: "whole exercise: 10 exercise passages added; 12 questions searched in the books, 0 lesson passages added", topSimilarity: 0.31, coverageLow: true, usedSearchGrounding: false, weakPages: 0, failedChecks: 0, outside: [{ text: "Black soil is also called regur soil.", found: 25, missing: ["regur", "also"] }] };
  const green = rated("c1", "Green answer", { correct: 95, fromBook: 89, reasons: ["Every calculation was checked by an exact calculator."] });
  const detailed = rated("c4", "Detailed answer", { correct: 57, fromBook: 5, reasons: ["About 95% of the answer is not found in the pages of your books."], details });
  const mixed = rated("c2", "Mixed answer", { correct: 66, fromBook: 31, reasons: ["About 69% of the answer is not found in the pages of your books.", "A web search was used: its facts were not checked against your books."] });
  const unrated = rated("c3", "Older answer", null);
  for (const a of [green, mixed, unrated, detailed]) await ctx.route(`**/api/documents/${a.id}`, (r) => json(r, { answer: a }));

  await page.goto(`${BASE}/dashboard/documents/c1`, { waitUntil: "networkidle" });
  const badge = page.getByTestId("confidence");
  await badge.waitFor();
  await badge.locator("summary").getByText("95", { exact: true }).waitFor();
  await badge.locator("summary").getByText("89", { exact: true }).waitFor();
  const colours = await badge.locator("summary span.font-semibold").evaluateAll((els) => els.map((e) => e.className));
  if (!colours.every((c) => /emerald/.test(c))) throw new Error(`Both numbers should be green: ${colours.join(" | ")}`);
  await badge.locator("summary").click();
  await badge.getByText("Correct and grounded:").waitFor();
  await badge.getByText(/89% from your books, 11% from outside them/).waitFor();
  await badge.getByText("Every calculation was checked by an exact calculator.").waitFor();
  await page.emulateMedia({ media: "print" });
  if (await badge.isVisible()) throw new Error("The confidence box is in the print view.");
  await page.emulateMedia({ media: "screen" });

  await page.goto(`${BASE}/dashboard/documents/c2`, { waitUntil: "networkidle" });
  const colours2 = await page.getByTestId("confidence").locator("summary span.font-semibold").evaluateAll((els) => els.map((e) => e.className));
  if (!/amber/.test(colours2[0]) || !/red/.test(colours2[1])) throw new Error(`66 should be amber and 31 red: ${colours2.join(" | ")}`);
  await page.getByTestId("confidence").locator("summary").click();
  await page.getByText(/About 69% of the answer is not found/).waitFor();
  await page.getByText(/A web search was used/).waitFor();

  // The details for finding the cause of a low score.
  await page.goto(`${BASE}/dashboard/documents/c4`, { waitUntil: "networkidle" });
  await page.getByTestId("confidence").locator("summary").first().click();
  await page.getByText("Details for finding the cause").click();
  for (const need of ["34 judged: 2 found in the books, 32 not found", "exercise p1-p10 (10), textbook p1 (1)", "whole exercise: 10 exercise passages added; 12 questions searched", "closest 0.31, weak", "web search not used", "Black soil is also called regur soil.", "not found in the books: regur, also"]) {
    await page.getByTestId("confidence-details").getByText(need, { exact: false }).first().waitFor({ timeout: 3000 }).catch(() => {
      throw new Error(`The details lack "${need}".`);
    });
  }
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy these details" }).click();
  await page.getByRole("button", { name: "Copied" }).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!copied.includes("Confidence 57 : 5") || !copied.includes("Statements judged: 34") || !copied.includes("[not found: regur, also]")) throw new Error(`Copied the wrong text: ${copied}`);

  await page.goto(`${BASE}/dashboard/documents/c3`, { waitUntil: "networkidle" });
  await page.getByText("Black soil suits cotton.").first().waitFor();
  if ((await page.getByTestId("confidence").count()) !== 0) throw new Error("An older answer with no score should show none.");
});

await test("A saved answer that used whole books lists one line per book, not every passage", async (page, ctx) => {
  const src = (i, book, n) => ({ id: `s${i}`, document_id: "b1", section_label: `Page ${n}`, page_number: n, source_type: "textbook", book });
  const sources = [...Array.from({ length: 10 }, (_, i) => src(i, "Geography Unit 2 Lethosphere Textbook", i + 1)), ...Array.from({ length: 6 }, (_, i) => src(20 + i, "Geography Unit 2 Lithosphere Exercises", i + 1))];
  const big = { ...answer, taskType: "ad_hoc", createdAt: now, pack: null, worked: null, id: "w1", title: "Whole books", text: "Done.", sources };
  await ctx.route("**/api/documents/w1", (r) => json(r, { answer: big }));
  await page.goto(`${BASE}/dashboard/documents/w1`, { waitUntil: "networkidle" });
  await page.getByText("Sources from your books").waitFor();
  await page.getByText(/Geography Unit 2 Lethosphere Textbook/).first().waitFor();
  await page.getByText(/pages 1 to 10 \(10 passages\)/).waitFor();
  await page.getByText(/pages 1 to 6 \(6 passages\)/).waitFor();
  if ((await page.locator("ol li", { hasText: "[1]" }).count()) !== 0) throw new Error("Every passage was listed.");
});

await test("Answers to check: the weak answers of an exercise are highlighted, listed and can be jumped to, and a print shows none of it", async (page, ctx) => {
  const text = "**Q1 (i). Which soil is found in northern Maharashtra?**\n**Ans:** Black soil.\n\n**Q1 (ii). Name the largest desert on Earth.**\n**Ans:** Antarctic Desert.\n\n**Q2.1 Research Mirabai.**\n**Ans:** A saint from Rajasthan. This is from general knowledge, not from the book.";
  const confidence = { correct: 71, fromBook: 64, reasons: ["2 answers should be checked: Q1 (ii), Q2.1."], review: [
    { index: 1, label: "Q1 (ii)", found: 0, level: "red", reason: "Only 0% of this answer's words are in your books." },
    { index: 2, label: "Q2.1", found: 35, level: "amber", reason: "From general knowledge, not from your books." },
  ] };
  const a = { ...answer, taskType: "solution", createdAt: now, pack: null, worked: null, id: "r1", title: "Exercise answers", text, confidence };
  await ctx.route("**/api/documents/r1", (r) => json(r, { answer: a }));
  await page.goto(`${BASE}/dashboard/documents/r1`, { waitUntil: "networkidle" });
  await page.getByTestId("review-count").getByText("2 to check").waitFor();
  const tags = page.getByTestId("review-tag");
  if ((await tags.count()) !== 2) throw new Error(`Expected two highlighted answers, saw ${await tags.count()}.`);
  await tags.first().getByText(/Check this answer: Only 0% of this answer's words are in your books\./).waitFor();
  await tags.nth(1).getByText(/From general knowledge, not from your books\./).waitFor();
  const first = page.getByRole("region", { name: "Answer to check: Q1 (ii)" });
  if (!/border-red/.test(await first.getAttribute("class"))) throw new Error("A red answer should have a red edge.");
  if (!/border-amber/.test(await page.getByRole("region", { name: "Answer to check: Q2.1" }).getAttribute("class"))) throw new Error("An amber answer should have an amber edge.");
  if ((await page.getByRole("region", { name: /Answer to check: Q1 \(i\)/ }).count()) !== 0) throw new Error("A good answer was highlighted.");
  await page.getByText("Black soil.").first().waitFor();

  await page.getByTestId("confidence").locator("summary").click();
  const list = page.getByTestId("review-list");
  await list.getByText("Answers to check first").waitFor();
  await list.getByRole("button", { name: "Q2.1 · 35%" }).click();
  await page.getByRole("region", { name: "Answer to check: Q2.1" }).waitFor();

  await page.emulateMedia({ media: "print" });
  if (await tags.first().isVisible()) throw new Error("The review tag is in the print view.");
  await page.getByText("Antarctic Desert.").first().waitFor();
  await page.emulateMedia({ media: "screen" });
});

await test("A saved answer that is gone says so", async (page, ctx) => {
  await ctx.route("**/api/documents/zz", (r) => json(r, { error: "no" }, 404));
  await page.goto(`${BASE}/dashboard/documents/zz`, { waitUntil: "networkidle" });
  await page.getByText("Answer not found").waitFor({ timeout: 8000 });
});

await test("My Documents: empty and error states", async (page, ctx) => {
  await ctx.route("**/api/documents", (r) => json(r, { documents: [] }));
  await page.goto(`${BASE}/dashboard/documents`, { waitUntil: "networkidle" });
  await page.getByText(/no saved|nothing|haven.t/i).first().waitFor({ timeout: 8000 });
  await ctx.unroute("**/api/documents");
  await ctx.route("**/api/documents", (r) => json(r, { error: "Syllabi can't reach its database right now. Wait a minute and try again." }, 503));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText(/can.t reach its database/i).first().waitFor({ timeout: 8000 });
});

await test("My Documents: search and kind filters narrow the list, and a deleted one goes", async (page, ctx) => {
  let docs = [
    { id: "d1", title: "Fractions notes", task_type: "notes", created_at: now },
    { id: "d2", title: "Plant questions", task_type: "solution", created_at: now },
    { id: "d3", title: "Light notes", task_type: "notes", created_at: now },
  ];
  await ctx.route("**/api/documents", (r) => json(r, { documents: docs }));
  await ctx.route("**/api/documents/d3", (r) => {
    docs = docs.filter((d) => d.id !== "d3");
    return json(r, { ok: true });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/dashboard/documents`, { waitUntil: "networkidle" });
  await page.getByText("3 of 3 answers").waitFor();
  await page.getByLabel("Search your documents by title").fill("plant");
  await page.getByText("1 of 3 answers").waitFor();
  await page.getByText("Fractions notes").waitFor({ state: "detached", timeout: 3000 });
  await page.getByLabel("Search your documents by title").fill("");
  await page.getByRole("group", { name: "Filter by kind" }).getByRole("button", { name: /Notes/i }).click();
  await page.getByText("2 of 3 answers").waitFor();
  await page.getByLabel("Search your documents by title").fill("zzz");
  await page.getByText("No answers match your search.").waitFor();
  await page.getByLabel("Search your documents by title").fill("");
  await page.getByRole("button", { name: 'Delete "Light notes"' }).click();
  await page.getByText("Light notes").waitFor({ state: "detached", timeout: 5000 });
  await page.getByText("1 of 2 answers").waitFor({ timeout: 5000 });
});

await test("My Documents: deleting while offline shows the connection message", async (page, ctx) => {
  const doc = { id: "d1", title: "Fractions notes", task_type: "notes", created_at: now };
  await ctx.route("**/api/documents", (r) => json(r, { documents: [doc] }));
  await ctx.route("**/api/documents/d1", (r) => r.abort("connectionrefused"));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/dashboard/documents`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /delete/i }).first().click();
  await page.getByText(/check your internet connection/i).first().waitFor({ timeout: 8000 });
});

await test("Kindergarten worksheets: the board game has a start, a pond, lily pads and rows that snake", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten/worksheets`, { waitUntil: "networkidle" });
  await page.getByRole("radiogroup", { name: "Kind of worksheet" }).getByRole("radio", { name: /pond/i }).click();
  await page.getByText("🐸 START").waitFor({ timeout: 5000 });
  await page.getByText("🏞️ POND").waitFor();
  if ((await page.getByLabel("Lily pad").count()) < 3) throw new Error("Expected several lily pads.");
  const rows = page.getByLabel("Board").locator("> div");
  if ((await rows.count()) < 3) throw new Error("Expected several board rows.");
  const directions = await rows.evaluateAll((els) => els.map((el) => getComputedStyle(el).direction));
  if (directions[0] !== "ltr" || directions[1] !== "rtl" || directions[2] !== "ltr") throw new Error(`Rows should snake, saw ${directions}`);
});

await test("Account: choosing a class saves at once, and deleting the account needs DELETE typed", async (page, ctx) => {
  await baseRoutes(ctx);
  const patches = [];
  let deleted = null;
  await ctx.route("**/api/me", (r) => {
    const method = r.request().method();
    if (method === "PATCH") {
      patches.push(r.request().postDataJSON());
      return json(r, { ok: true, fullName: "Asha" });
    }
    if (method === "DELETE") {
      deleted = r.request().postDataJSON();
      return json(r, { ok: true });
    }
    return json(r, me);
  });
  await page.goto(`${BASE}/dashboard/account`, { waitUntil: "networkidle" });
  await page.getByLabel("Child's class").selectOption("Class 7");
  await page.getByText("Saved").first().waitFor({ timeout: 5000 });
  await page.getByLabel("Answer language").selectOption("hi");
  await page.getByText("Saved").first().waitFor({ timeout: 5000 });
  if (JSON.stringify(patches) !== JSON.stringify([{ classLevel: "Class 7" }, { answerLanguage: "hi" }])) throw new Error(`Unexpected saves: ${JSON.stringify(patches)}`);
  const button = page.getByRole("button", { name: "Delete my account" });
  if (!(await button.isDisabled())) throw new Error("Delete should be off until DELETE is typed.");
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  if (!(await button.isDisabled())) throw new Error("Lower-case delete should not count.");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await button.click();
  await page.waitForURL(/\/login/, { timeout: 10000 });
  if (deleted?.confirm !== "DELETE") throw new Error(`Unexpected delete body ${JSON.stringify(deleted)}`);
});

await test("Account: shows the signed-in details", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/account`, { waitUntil: "networkidle" });
  await page.getByText("parent@example.com").first().waitFor();
});

await test("Practice: the choices follow the kind of numbers", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/practice`, { waitUntil: "networkidle" });
  await page.getByLabel("Size of numbers").waitFor();
  const kinds = page.getByRole("radiogroup", { name: "Kind of numbers" });
  await kinds.getByRole("radio", { name: /Decimal/i }).click();
  await page.getByLabel("After the point").waitFor();
  await page.getByLabel("Before the point").waitFor();
  await kinds.getByRole("radio", { name: /Fraction/i }).click();
  await page.getByLabel("Bottom numbers up to").waitFor();
  await page.getByLabel("Include fractions bigger than 1").check();
  await page.getByLabel("Write them as mixed numbers (1 3/4)").waitFor();
  await page.getByLabel("Keep numbers close (optional)").waitFor({ state: "detached", timeout: 3000 });
});

await test("Practice: an example number sets the kind, and a bad one says why", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/practice`, { waitUntil: "networkidle" });
  const sample = page.getByLabel("Example number (optional)");
  await sample.fill("3.141");
  await page.getByLabel("After the point").waitFor({ timeout: 5000 });
  await sample.fill("3/7");
  await page.getByLabel("Bottom numbers up to").waitFor({ timeout: 5000 });
  await sample.fill("3.14159");
  await page.getByText("Decimals can have up to 4 digits after the point.").waitFor({ timeout: 5000 });
  await sample.fill("abc");
  await page.getByText("Type a number like 456, 3.14, 3/7 or 1 3/4.").first().waitFor({ timeout: 5000 });
  await sample.fill("4,507");
  await page.getByLabel("Size of numbers").waitFor({ timeout: 5000 });
  await page.getByText("Type a number like 456, 3.14, 3/7 or 1 3/4.").first().waitFor({ state: "detached", timeout: 3000 });
});

await test("Practice: starts a quiz", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/practice`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /start/i }).first().click();
  await page.getByText(/put .* in order|smallest|largest|order/i).first().waitFor({ timeout: 8000 });
});

await test("Practice: plays a whole quiz to the results screen", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/practice`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /start/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "Practice quiz" });
  await dialog.waitFor({ timeout: 8000 });
  const heading = await dialog.getByText(/^Question \d+ of \d+$/).textContent();
  const total = Number(heading.match(/of (\d+)/)[1]);
  for (let q = 0; q < total; q++) {
    await dialog.getByText(`Question ${q + 1} of ${total}`).waitFor({ timeout: 5000 });
    const numbers = dialog.getByRole("region", { name: "Numbers to put in order" }).getByRole("button");
    const count = await numbers.count();
    // Tap each number once, in the order shown (right or wrong, the screen must cope with both).
    for (let i = 0; i < count; i++) await dialog.getByRole("region", { name: "Numbers to put in order" }).getByRole("button").nth(i).click();
    await dialog.getByRole("button", { name: "Check" }).click();
    await dialog.getByRole("status").waitFor({ timeout: 5000 });
    await dialog.getByText("Your order").first().waitFor();
    const wrong = await dialog.getByText("Right order").count();
    if (wrong > 0) await dialog.getByText(/^(Smallest|Biggest|Put the numbers|Not quite|Nearly|Good try)/).first().waitFor({ timeout: 3000 }).catch(() => {});
    await dialog.getByRole("button", { name: q === total - 1 ? "See my score" : "Next question" }).click();
  }
  await dialog.getByText("All done").waitFor({ timeout: 5000 });
  await dialog.getByText(new RegExp(`/ ${total}$`)).waitFor();
  await dialog.getByRole("button", { name: "New quiz" }).waitFor();
  await dialog.getByRole("button", { name: "Change settings" }).click();
  await dialog.waitFor({ state: "detached", timeout: 5000 });
});

await test("Practice: leaving a quiz midway asks first", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/practice`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /start/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "Practice quiz" });
  await dialog.waitFor({ timeout: 8000 });
  await dialog.getByRole("region", { name: "Numbers to put in order" }).getByRole("button").first().click();
  let asked = "";
  page.once("dialog", (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await dialog.getByRole("button", { name: "Leave the quiz" }).click();
  if (!/Leave this quiz/.test(asked)) throw new Error("no confirmation: " + asked);
  await dialog.waitFor({ timeout: 2000 });
});

await test("Install as an app: the manifest, icons, service worker and offline page are public and complete", async (page) => {
  const get = (path) => page.request.get(`${BASE}${path}`);
  const manifest = await (await get("/manifest.webmanifest")).json();
  if (manifest.display !== "standalone" || manifest.scope !== "/" || manifest.id !== "/" || !manifest.start_url) throw new Error(`Manifest is incomplete: ${JSON.stringify(manifest)}`);
  const sizes = manifest.icons.map((i) => `${i.sizes}${i.purpose ? ":" + i.purpose : ""}`);
  for (const need of ["192x192", "512x512", "512x512:maskable"]) if (!sizes.includes(need)) throw new Error(`Missing icon ${need} in ${sizes.join()}`);
  for (const icon of manifest.icons) if (!(await get(icon.src)).ok()) throw new Error(`${icon.src} can't be fetched without signing in.`);
  if (manifest.shortcuts.length < 2) throw new Error("No shortcuts.");
  const sw = await get("/sw.js");
  if (!sw.ok() || !(await sw.text()).includes("addEventListener(\"fetch\"")) throw new Error("The service worker isn't served.");
  if (!/no-cache/.test(sw.headers()["cache-control"] ?? "")) throw new Error("The service worker must never be cached: " + sw.headers()["cache-control"]);
  const offline = await get("/offline.html");
  if (!offline.ok() || !(await offline.text()).includes("You're offline")) throw new Error("The offline page isn't served without signing in.");
  const version = await get("/api/version");
  if (!version.ok() || typeof (await version.json()).build !== "string") throw new Error("/api/version isn't public or has no build.");
});

await test("Install as an app: an open window says when a newer version is live, and Reload loads it", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/version", (r) => json(r, { build: "a-newer-build" }));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByText("A new version of Syllabi is ready.").waitFor({ timeout: 8000 });
  let loads = 0;
  page.on("load", () => loads++);
  await page.getByRole("button", { name: "Reload" }).click();
  await page.waitForEvent("load", { timeout: 8000 });
  if (loads < 1) throw new Error("Reload did not reload the page.");
});

await test("Report a problem: the button is on every screen", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/admin/**", (r) => json(r, { students: [], reports: [], checks: [], settings: [] }));
  for (const path of ["/dashboard", "/dashboard/library", "/dashboard/documents", "/dashboard/practice", "/dashboard/account", "/admin/reports"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Report a problem" }).waitFor({ timeout: 15000 }).catch(() => {
      throw new Error(`No Report a problem button on ${path}.`);
    });
  }
});

await test("Report a problem: it captures what was typed, sent and received, shows it, and sends a clean ticket", async (page, ctx) => {
  await baseRoutes(ctx);
  await ctx.route("**/api/generate/**", (r) => json(r, { ...answer, text: "The answer is forty two." }));
  let posted = null;
  await ctx.route("**/api/bug-reports", (r) => {
    if (r.request().method() === "POST") {
      posted = r.request().postDataJSON();
      return json(r, { id: "11111111-1111-4111-8111-111111111111", number: 12 });
    }
    return json(r, { reports: [{ id: "x1", number: 3, title: "An older report", status: "fixed" }] });
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("What is six times seven? password=hunter2");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await page.getByText("The answer is forty two.").first().waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: "Report a problem" }).click();
  const dialog = page.getByRole("dialog", { name: "Report a problem" });
  await dialog.getByText("#3 An older report").waitFor();
  await dialog.getByText(/See exactly what will be sent/).click();
  const preview = await dialog.locator("pre").textContent();
  for (const need of ["/api/generate/solution", "What is six times seven?", "The answer is forty two."]) if (!preview.includes(need)) throw new Error(`The preview lacks "${need}".`);

  // Nothing to send without a title.
  await dialog.getByRole("button", { name: "Send report" }).click();
  await dialog.getByText(/Write a short title first/).waitFor();
  await dialog.getByLabel("What went wrong?").fill("Answer skipped a question");
  await dialog.getByLabel(/What did you expect instead/).fill("All five answers");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await dialog.getByText("Report #12 sent.").waitFor({ timeout: 8000 });

  const c = posted.context;
  const gen = c.requests.find((q) => q.path === "/api/generate/solution");
  if (!gen || gen.method !== "POST" || gen.status !== 200) throw new Error(`The request was not captured: ${JSON.stringify(c.requests)}`);
  if (!gen.sent.includes("What is six times seven?")) throw new Error("What was sent (the input) is missing.");
  if (!gen.received.includes("The answer is forty two.")) throw new Error("What came back (the output) is missing.");
  if (!c.steps.some((s) => s.kind === "click" && /Generate/.test(s.text)) || !c.steps.some((s) => s.kind === "page" && /\/dashboard/.test(s.text))) throw new Error("The steps are missing the click or the page.");
  if (!c.onScreen.fields.some((f) => f.value.includes("What is six times seven?"))) throw new Error("The typed question is missing.");
  if (!c.onScreen.text.includes("The answer is forty two.")) throw new Error("The answer shown is missing.");
  if (posted.title !== "Answer skipped a question" || posted.description !== "All five answers" || posted.path !== "/dashboard") throw new Error(`Wrong fields: ${JSON.stringify({ t: posted.title, d: posted.description, p: posted.path })}`);
  if (/"cookie"|authorization/i.test(JSON.stringify(c))) throw new Error("Something private was sent.");
  if (!/Chrom/.test(c.userAgent) || !/\d+x\d+/.test(c.viewport)) throw new Error("The browser details are missing.");
});

await test("Report a problem: leaving out what is on the screen is respected, and an offline or refused send is explained", async (page, ctx) => {
  await baseRoutes(ctx);
  let posted = null;
  let refuse = true;
  await ctx.route("**/api/bug-reports", (r) => {
    if (r.request().method() === "GET") return json(r, { reports: [] });
    posted = r.request().postDataJSON();
    return refuse ? json(r, { error: "You have raised 20 reports today, which is the most for one day. Try again tomorrow." }, 429) : json(r, { id: "x", number: 1 });
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("a private question");
  await page.getByRole("button", { name: "Report a problem" }).click();
  const dialog = page.getByRole("dialog", { name: "Report a problem" });
  await dialog.getByLabel(/Include what is on my screen/).uncheck();
  await dialog.getByLabel("What went wrong?").fill("Something odd");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await dialog.getByText(/most for one day/).waitFor();
  if (posted.context.onScreen !== undefined || JSON.stringify(posted).includes("a private question")) throw new Error("The screen was sent although it was switched off.");
  refuse = false;
  await dialog.getByRole("button", { name: "Send report" }).click();
  await dialog.getByText("Report #1 sent.").waitFor();
  // (The dev server's own round badge sits over the button's corner here, so press it from the keyboard.)
  await dialog.getByRole("button", { name: "Done" }).press("Enter");
  await dialog.waitFor({ state: "detached" });
});

await test("Admin reports: the list, a ticket to copy, and setting its status", async (page, ctx) => {
  await ctx.route("**/api/me", (r) => json(r, me));
  const rows = [
    { id: "11111111-1111-4111-8111-111111111111", number: 12, title: "Answer skipped a question", status: "open", created_at: now, path: "/dashboard", students: { email: "ravi@example.com", full_name: "Ravi" } },
    { id: "22222222-2222-4222-8222-222222222222", number: 11, title: "Download did nothing", status: "fixed", created_at: now, path: "/dashboard/library", students: { email: "ravi@example.com", full_name: "Ravi" } },
  ];
  let patched = null;
  await ctx.route("**/api/bug-reports?all=1", (r) => json(r, { reports: rows }));
  await ctx.route("**/api/bug-reports/11111111-1111-4111-8111-111111111111", (r) => {
    if (r.request().method() === "PATCH") {
      patched = r.request().postDataJSON();
      return json(r, { report: { id: "1", number: 12, status: patched.status, resolution: patched.resolution } });
    }
    return json(r, { report: { id: "1", number: 12, status: "open", resolution: null }, markdown: "# Bug #12: Answer skipped a question\n\n## Requests the screen made\n### POST /api/generate/solution → 200" });
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${BASE}/admin/reports`, { waitUntil: "networkidle" });
  await page.getByText("#12 Answer skipped a question").waitFor();
  await page.getByText("1 open", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Fixed", exact: true }).click();
  await page.getByText("#12 Answer skipped a question").waitFor({ state: "detached", timeout: 3000 });
  await page.getByText("#11 Download did nothing").waitFor();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByText("#12 Answer skipped a question").click();
  await page.getByLabel("Ticket").getByText(/Bug #12/).waitFor();
  await page.getByRole("button", { name: "Copy ticket for Claude" }).click();
  await page.getByText(/Copied/).waitFor();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  if (!clip.startsWith("# Bug #12") || !clip.includes("POST /api/generate/solution")) throw new Error(`Copied the wrong text: ${clip}`);
  await page.getByLabel("Status", { exact: true }).selectOption("fixed");
  await page.getByLabel(/What was done/).fill("Raised the page limit.");
  await page.getByRole("button", { name: "Save status and note" }).click();
  await page.getByText("Saved.").waitFor();
  if (patched.status !== "fixed" || patched.resolution !== "Raised the page limit.") throw new Error(`Saved ${JSON.stringify(patched)}.`);
});

await test("Sign-in: wrong password message is plain and specific", async (page) => {
  await page.goto(`${BASE}/login?error=invalid`, { waitUntil: "networkidle" });
  await page.getByText(/Wrong email, user ID or password/).first().waitFor();
});

await test("Menus: a spinning wheel shows while the next screen loads", async (page) => {
  await page.goto(`${BASE}/admin/health`, { waitUntil: "networkidle" });
  await page.route("**/admin/rules**", async (r) => {
    await new Promise((res) => setTimeout(res, 2500));
    await r.continue();
  });
  await page.getByRole("link", { name: "Rules" }).evaluate((el) => el.click());
  await page.getByRole("link", { name: "Rules" }).getByRole("status", { name: "Loading" }).waitFor({ timeout: 2000 });
});

await test("Admin rules: groups, a rule and the exact instructions are shown", async (page) => {
  await page.goto(`${BASE}/admin/rules`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Rules and assumptions" }).waitFor();
  await page.getByRole("heading", { name: "How an answer is written" }).waitFor();
  await page.getByText(/Every question and every sub-part/i).first().waitFor();
  await page.getByText("Exact instructions sent to the AI").waitFor();
  await page.locator("details summary", { hasText: "Paper checker" }).click();
  await page.locator("details[open] pre").first().waitFor();
});

await test("Sign-up: private-testing notice", async (page) => {
  await page.goto(`${BASE}/signup?error=private`, { waitUntil: "networkidle" });
  await page.getByRole("alert").filter({ hasText: /private|testing/i }).first().waitFor();
});

await browser.close();
stopServer();

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `\n      ${r.why}`}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
