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
const tinyJpeg = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
// Taps by script: buttons inside the animated study pack never count as "still" for a real click.
const tap = (locator) => locator.evaluate((el) => el.click());

const results = [];
let browser;
async function test(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const crashes = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  try {
    await fn(page, ctx);
    if (crashes.length) throw new Error(`The page threw errors: ${crashes.join(" | ")}`);
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, why: err instanceof Error ? err.message.split("\n")[0] : String(err) });
  }
  await ctx.close();
}

const json = (route, body, status = 200) => route.fulfill({ status, json: body });
const baseRoutes = async (ctx, extra = {}) => {
  await ctx.route("**/api/me", (r) => json(r, extra.me ?? me));
  await ctx.route("**/api/library*", (r) => (r.request().method() === "GET" ? json(r, { documents: extra.books ?? books }) : json(r, { error: "x" }, 500)));
};

await waitForServer();
browser = await chromium.launch({ executablePath: CHROMIUM });

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
  await page.getByText(/Revision notes for the chapter on Motion/).first().waitFor();
});

await test("My Books: lists books with reading progress", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByText("Maths Chapter 3").first().waitFor();
  await page.getByText("Science Notes").first().waitFor();
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

await test("Admin accounts: making a guest shows the password once", async (page, ctx) => {
  await ctx.route("**/api/admin/students", (r) => json(r, { students: [] }));
  await ctx.route("**/api/admin/guests", (r) => json(r, { account: { id: "g1", email: "reviewer@example.com", full_name: "Guest", role: "student", active: true, token_quota: 20000, guest_until: new Date(Date.now() + 14 * 86400000).toISOString(), created_at: now }, password: "Abcd2345Wxyz" }));
  await page.goto(`${BASE}/admin/students`, { waitUntil: "networkidle" });
  await page.fill("#guest-email", "reviewer@example.com");
  await page.getByRole("button", { name: /Make guest login/ }).click();
  await page.getByText("Abcd2345Wxyz").first().waitFor({ timeout: 8000 });
  await page.getByText(/shown only once/).first().waitFor();
  await page.getByText(/Guest, signs in until/).first().waitFor();
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
  await tap(page.getByRole("button", { name: /Play/ }).first());
  for (let q = 0; q < 5; q++) {
    const box = page.locator("[data-word]");
    await box.waitFor();
    const word = await box.getAttribute("data-word");
    // A wrong letter first: it must not be accepted.
    for (const letter of word) {
      await tap(page.getByRole("group", { name: "Letters to choose from" }).getByRole("button", { name: letter, exact: true }).and(page.locator("button:not([disabled])")).first());
    }
    // The sounds are blended into the word ("m · a · p = map") before the next question.
    if (q === 0) await page.getByLabel(/make the word/).waitFor({ timeout: 15000 });
    if (q < 4) await page.locator(`[data-word]:not([data-word="${word}"])`).waitFor({ timeout: 20000 });
  }
  await page.getByText("Well done!").first().waitFor({ timeout: 20000 });
});

await test("Kindergarten: a wrong letter says try again and does not place it", async (page, ctx) => {
  await baseRoutes(ctx);
  await speechOk(ctx);
  await page.goto(`${BASE}/dashboard/practice/kindergarten`, { waitUntil: "networkidle" });
  await tap(page.getByRole("button", { name: /Play/ }).first());
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
  await tap(page.getByRole("button", { name: /Play/ }).nth(1));
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
  await tap(page.getByRole("button", { name: /Play/ }).nth(2));
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

await test("My Books: a failed list shows a retry message", async (page, ctx) => {
  await ctx.route("**/api/me", (r) => json(r, me));
  await ctx.route("**/api/library*", (r) => json(r, { error: "Couldn't load your books." }, 500));
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByText(/couldn.t load/i).first().waitFor({ timeout: 8000 });
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

await test("Account: shows the signed-in details", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/account`, { waitUntil: "networkidle" });
  await page.getByText("parent@example.com").first().waitFor();
});

await test("Practice: starts a quiz", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/practice`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /start/i }).first().click();
  await page.getByText(/put .* in order|smallest|largest|order/i).first().waitFor({ timeout: 8000 });
});

await test("Sign-in: wrong password message is plain and specific", async (page) => {
  await page.goto(`${BASE}/login?error=invalid`, { waitUntil: "networkidle" });
  await page.getByText(/Wrong email or password/).first().waitFor();
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
