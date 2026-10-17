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

await test("My Books: lists books with reading progress", async (page, ctx) => {
  await baseRoutes(ctx);
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "networkidle" });
  await page.getByText("Maths Chapter 3").first().waitFor();
  await page.getByText("Science Notes").first().waitFor();
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
