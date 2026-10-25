// Route tests: calls the real route handlers with a fake database and a fake
// signed-in person, and checks status codes and messages for signed-out,
// not-allowed, bad input, over-allowance and not-found cases.
import { session } from "./fakes/auth";
import { deleted, files, storageState } from "./fakes/storage";
import { resetDb, tables, rpcs, failures } from "./fakes/db";
import * as me from "../../src/app/api/me/route";
import * as library from "../../src/app/api/library/route";
import * as book from "../../src/app/api/library/[id]/route";
import * as documents from "../../src/app/api/documents/route";
import * as answer from "../../src/app/api/documents/[id]/route";
import * as students from "../../src/app/api/admin/students/route";
import * as llm from "../../src/app/api/admin/llm-settings/route";
import * as adhoc from "../../src/app/api/generate/ad-hoc/route";
import * as jobs from "../../src/app/api/jobs/pages/route";
import { pipeline } from "./fakes/pipeline";
import { llm as fakeAi } from "./fakes/llm";
import * as studyPack from "../../src/app/api/generate/study-pack/route";
import { QUESTIONS_SYSTEM, WALKTHROUGH_SYSTEM } from "../../src/lib/study-pack/prompts";
import { ssrState } from "./fakes/ssr";
import { updateSession } from "../../src/lib/supabase/middleware";
import { NextRequest } from "next/server";
import * as health from "../../src/app/api/admin/health/route";
import * as bookDownload from "../../src/app/api/library/[id]/download/route";
import { made as madePdfs } from "./fakes/book-pdf";
import { arrangeBookPages } from "../../src/lib/pdf/book-pages";
import { formatContext, loadSourceImages, retrieveContext } from "../../src/lib/rag/retrieve";
import { namedPages, wantsWholeSection } from "../../src/lib/rag/whole-pages";
import * as scanCheck from "../../src/app/api/library/[id]/scan/route";
import { countWeakPages } from "../../src/lib/ingestion/page-read";
import * as reports from "../../src/app/api/bug-reports/route";
import * as report from "../../src/app/api/bug-reports/[id]/route";
import sharp from "sharp";
import { allPrompts, ruleGroups } from "../../src/lib/rules/catalogue";
import { measureImage } from "../../src/lib/ingestion/image-quality";
import { HANDWRITTEN_PAGE } from "../fixtures/bhakti-exercise-pages";
import { scorePage, summariseBook, takeLegibility } from "../../src/lib/ingestion/confidence";
import * as paperCheck from "../../src/app/api/generate/paper-check/route";
import * as guests from "../../src/app/api/admin/guests/route";
import * as speech from "../../src/app/api/speech/route";
import * as sounds from "../../src/app/api/sounds/route";
import * as sound from "../../src/app/api/sounds/[letter]/route";
import * as logError from "../../src/app/api/log-error/route";
import { pageProgress, readQueuedPages } from "../../src/lib/ingestion/jobs";
import type { Student } from "@/types/database";

process.env.OPEN_SIGNUPS = "true";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const BOOK = "33333333-3333-4333-8333-333333333333";
const ANSWER = "44444444-4444-4444-8444-444444444444";

const person = (over: Partial<Student> = {}): Student =>
  ({ id: ME, email: "p@example.com", full_name: "Asha", role: "student", active: true, token_quota: 1000, class_level: null, board: null, answer_language: null, ...over }) as Student;

let failures_ = 0;
let total = 0;
function check(name: string, ok: boolean, detail = "") {
  total++;
  if (!ok) failures_++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
}

type Handler = (req: Request, ctx: { params: Promise<{ id: string; letter?: string }> }) => Promise<Response>;
async function call(handler: unknown, body?: unknown, opts: { id?: string; raw?: string; headers?: Record<string, string> } = {}) {
  const req = new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const res = await (handler as Handler)(req, { params: Promise.resolve({ id: opts.id ?? "x", letter: opts.id ?? "x" }) });
  const json = await res.clone().json().catch(() => null);
  return { status: res.status, json: json as Record<string, unknown> | null };
}

async function expect(name: string, handler: unknown, status: number, match: RegExp | null, body?: unknown, opts?: Parameters<typeof call>[2]) {
  const r = await call(handler, body, opts);
  const text = String(r.json?.error ?? "");
  check(name, r.status === status && (match === null || match.test(text)), `${r.status} ${text}`);
  return r;
}

function fresh(user: Student | null = person()) {
  resetDb();
  session.user = user;
  session.outage = false;
  deleted.length = 0;
  files.clear();
  rpcs.student_monthly_usage = () => 0;
  rpcs.page_job_counts = () => [];
  tables.students = user ? [{ ...user }] : [];
}

// ---- Signed out, no access, and outage: the same on every route ----
fresh(null);
for (const [name, h] of [["me", me.GET], ["library", library.GET], ["documents", documents.GET]] as const) {
  await expect(`${name}: signed out gets 401 and a sign-in message`, h, 401, /sign in again/i, undefined);
}
fresh(person({ active: false }));
await expect("an account without access gets 403", library.GET, 403, /doesn't have access/i, undefined);
process.env.OPEN_SIGNUPS = "false";
await expect("private testing: a normal account gets 403, an admin gets in", library.GET, 403, /doesn't have access/i, undefined);
session.user = person({ role: "admin" });
await expect("private testing: the admin is allowed", library.GET, 200, null, undefined);
process.env.OPEN_SIGNUPS = "true";
fresh(person());
session.outage = true;
await expect("a database outage is reported as 503, not 'sign in again'", library.GET, 503, /can't reach its database/i, undefined);

// ---- Account (me) ----
fresh();
await expect("me PATCH: an empty name is refused", me.PATCH, 400, /name/i, { fullName: "  " });
await expect("me PATCH: an unknown class is refused", me.PATCH, 400, /class/i, { classLevel: "Class 99" });
await expect("me PATCH: nothing to change is refused", me.PATCH, 400, /nothing to change/i, {});
await expect("me PATCH: unreadable body is refused", me.PATCH, 400, /couldn't be read/i, undefined, { raw: "{nope" });
await expect("me PATCH: a good name is saved", me.PATCH, 200, null, { fullName: "Asha K" });
await expect("me DELETE: needs DELETE typed", me.DELETE, 400, /type DELETE/i, { confirm: "delete" });

// ---- Books ----
fresh();
await expect("library POST: a missing title is refused", library.POST, 400, /title/i, { sourceType: "textbook", rightsConfirmed: true });
await expect("library POST: an unknown kind is refused", library.POST, 400, /kind of material/i, { title: "Maths", sourceType: "comic", rightsConfirmed: true });
await expect("library POST: the rights box must be ticked", library.POST, 400, /Tick the box/i, { title: "Maths", sourceType: "textbook" });
const created = await expect("library POST: a good book is created", library.POST, 200, null, { title: "Maths", sourceType: "textbook", rightsConfirmed: true });
check("library POST: the new book belongs to the caller", (tables.documents ?? []).some((d) => d.id === created.json?.documentId && d.owner_id === ME));
rpcs.student_monthly_usage = () => 5000;
await expect("library POST: over the allowance gets 429", library.POST, 429, /allowance/i, { title: "Maths", sourceType: "textbook", rightsConfirmed: true });
rpcs.student_monthly_usage = () => 0;
tables.documents = Array.from({ length: 300 }, (_, i) => ({ id: `d${i}`, owner_id: ME }));
await expect("library POST: the 300-book cap is explained", library.POST, 400, /300 books/i, { title: "Maths", sourceType: "textbook", rightsConfirmed: true });

fresh();
tables.documents = [{ id: BOOK, owner_id: ME, title: "Maths" }, { id: "55555555-5555-4555-8555-555555555555", owner_id: OTHER, title: "Theirs" }];
await expect("book PATCH: a bad id is a 404", book.PATCH, 404, /no longer exists/i, { title: "x" }, { id: "not-an-id" });
await expect("book PATCH: someone else's book is a 404", book.PATCH, 404, /no longer exists/i, { title: "x" }, { id: "55555555-5555-4555-8555-555555555555" });
await expect("book PATCH: an empty title is refused", book.PATCH, 400, /title/i, { title: " " }, { id: BOOK });
await expect("book PATCH: a rename is saved", book.PATCH, 200, null, { title: "Maths 6" }, { id: BOOK });
await expect("book DELETE: someone else's book is a 404", book.DELETE, 404, null, undefined, { id: "55555555-5555-4555-8555-555555555555" });
storageState.failDeletes = true;
await expect("book DELETE: if its page images can't be removed, it says the book is still there", book.DELETE, 500, /still in My books/i, undefined, { id: BOOK });
check("book DELETE: the book stays listed, to delete again", (tables.documents ?? []).some((d) => d.id === BOOK));
storageState.failDeletes = false;
await expect("book DELETE: your own book is deleted", book.DELETE, 200, null, undefined, { id: BOOK });
check("book DELETE: the record is gone and its page images are cleared", !(tables.documents ?? []).some((d) => d.id === BOOK) && deleted.includes(`sources/${BOOK}/`));
failures.push({ table: "documents", message: "boom" });
tables.documents = [{ id: BOOK, owner_id: ME }];
failures.length = 0;
failures.push({ table: "documents", message: "connection reset" });
await expect("book DELETE: a database failure says nothing was deleted", book.DELETE, 500, /Nothing was deleted/i, undefined, { id: BOOK });

// ---- Saved answers ----
fresh();
tables.generated_documents = [
  { id: ANSWER, student_id: OTHER, title: "Theirs", task_type: "notes", content: "x", sources: [], created_at: "2026-01-01" },
];
await expect("answer GET: someone else's answer is a 404", answer.GET, 404, /no longer exists|not found/i, undefined, { id: ANSWER });
session.user = person({ role: "admin" });
await expect("answer GET: an admin can open anyone's", answer.GET, 200, null, undefined, { id: ANSWER });

// ---- Admin pages ----
fresh(person({ role: "student" }));
await expect("admin students PATCH: a normal account gets 403", students.PATCH, 403, /admin/i, { id: OTHER, active: false });
await expect("admin llm-settings PATCH: a normal account gets 403", llm.PATCH, 403, /admin/i, { taskType: "notes", provider: "google", model: "gemini-flash-latest" });
fresh(person({ role: "admin" }));
await expect("admin students PATCH: turning off your own account is refused", students.PATCH, 400, /own account/i, { id: ME, active: false });
await expect("admin students PATCH: demoting yourself is refused", students.PATCH, 400, /own account/i, { id: ME, role: "student" });
await expect("admin students PATCH: a bad allowance is refused", students.PATCH, 400, /whole number/i, { id: OTHER, token_quota: -5 });
await expect("admin students PATCH: a bad role is refused", students.PATCH, 400, /role/i, { id: OTHER, role: "owner" });
await expect("admin students PATCH: an unknown account is a 404", students.PATCH, 404, /no longer exists/i, { id: OTHER, active: false });
tables.students.push({ id: OTHER, email: "o@example.com", active: true, role: "student", token_quota: 10 });
await expect("admin students PATCH: a good change is saved", students.PATCH, 200, null, { id: OTHER, token_quota: 5000 });
await expect("admin llm-settings PATCH: embeddings must stay on Google", llm.PATCH, 400, /Google/i, { taskType: "embedding", provider: "groq", model: "x" });
await expect("admin llm-settings PATCH: a bad model name is refused", llm.PATCH, 400, /model name/i, { taskType: "notes", provider: "google", model: "bad name!" });

// ---- Recorded letter sounds ----
const audio = (letter: string, body: string, type = "audio/webm") => ({ id: letter, raw: body, headers: { "content-type": type } });
const putSound = (letter: string, body: string, type = "audio/webm") => call(sound.PUT, undefined, audio(letter, body, type));
fresh(null);
await expect("sounds: signed out gets 401", sounds.GET, 401, /sign in again/i, undefined);
fresh();
const saved = await putSound("m", "RIFFfakeaudio");
check("sounds PUT: a recording is saved", saved.status === 200, String(saved.status));
check("sounds PUT: stored privately under the caller's id", files.has(`sounds/${ME}/m`));
const notAudio = await putSound("a", "<html>", "text/html");
check("sounds PUT: something that isn't audio is refused", notAudio.status === 400 && /audio recording/i.test(String(notAudio.json?.error)), String(notAudio.json?.error));
const empty = await putSound("a", "");
check("sounds PUT: an empty recording is refused", empty.status === 400 && /empty/i.test(String(empty.json?.error)));
const long = await putSound("a", "x".repeat(500_000));
check("sounds PUT: an overlong recording is refused", long.status === 400 && /too long/i.test(String(long.json?.error)));
const badLetter = await putSound("mm", "RIFFfake");
check("sounds PUT: only a single letter is accepted", badLetter.status === 400, String(badLetter.status));
const traversal = await putSound("../x", "RIFFfake");
check("sounds PUT: a path trick is refused", traversal.status === 400 && ![...files.keys()].some((k) => k.includes("..")));
const list = await call(sounds.GET);
check("sounds GET: lists the letters recorded", JSON.stringify(list.json?.letters) === JSON.stringify(["m"]), JSON.stringify(list.json));
const got = await (sound.GET as unknown as Handler)(new Request("http://localhost/x"), { params: Promise.resolve({ id: "m", letter: "m" } as never) });
check("sounds GET letter: returns the audio with its type", got.status === 200 && got.headers.get("content-type") === "audio/webm" && (await got.text()) === "RIFFfakeaudio");
// Someone else's recording is never reachable.
files.set(`sounds/${OTHER}/p`, { data: Buffer.from("theirs"), contentType: "audio/webm" });
const theirs = await (sound.GET as unknown as Handler)(new Request("http://localhost/x"), { params: Promise.resolve({ letter: "p" } as never) });
check("sounds GET letter: another account's recording is not reachable", theirs.status === 404);
check("sounds GET: only the caller's letters are listed", JSON.stringify((await call(sounds.GET)).json?.letters) === JSON.stringify(["m"]));
const removed = await (sound.DELETE as unknown as Handler)(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ letter: "m" } as never) });
check("sounds DELETE: removes the caller's recording", removed.status === 200 && !files.has(`sounds/${ME}/m`) && files.has(`sounds/${OTHER}/p`));

// ---- Speech: sounds and phrases ----
fresh();
await expect("speech: nothing to say is refused", speech.POST, 400, /no text/i, { text: " " });
await expect("speech: a letter sound must be short", speech.POST, 400, /only a few characters/i, { text: "this is far too long", kind: "sound" });
await expect("speech: a very long text is refused", speech.POST, 400, /too long/i, { text: "x".repeat(3000) });

// ---- Guest accounts ----
fresh(person({ role: "student" }));
await expect("guests POST: a normal account gets 403", guests.POST, 403, /admin/i, { email: "g@example.com", days: 7, allowance: 20000 });
fresh(person({ role: "admin" }));
await expect("guests POST: a bad email is refused", guests.POST, 400, /valid email/i, { email: "nope", days: 7, allowance: 20000 });
await expect("guests POST: too many days is refused", guests.POST, 400, /days/i, { email: "g@example.com", days: 5000, allowance: 20000 });
await expect("guests POST: a tiny allowance is refused", guests.POST, 400, /allowance/i, { email: "g@example.com", days: 7, allowance: 5 });
const guest = await expect("guests POST: a good guest is made", guests.POST, 200, null, { email: "G@Example.com", days: 7, allowance: 20000 });
const row = (tables.students ?? []).find((s) => s.email === "g@example.com");
check("guests POST: the password is returned once and is 12 characters", typeof guest.json?.password === "string" && (guest.json.password as string).length === 12);
check("guests POST: the account is active, not an admin, with its own allowance and an expiry", row?.active === true && row.role === "student" && row.token_quota === 20000 && typeof row.guest_until === "string");
check("guests POST: the password is not stored", !JSON.stringify(row).includes(String(guest.json?.password)));
await expect("guests POST: the same email twice is explained", guests.POST, 400, /already exists/i, { email: "g@example.com", days: 7, allowance: 20000 });
await expect("guests POST: a user ID with spaces is refused", guests.POST, 400, /user ID/i, { loginId: "my guest", password: "study-2026", days: 30, allowance: 20000 });
await expect("guests POST: a user ID that looks like an email is refused", guests.POST, 400, /user ID/i, { loginId: "a@b.com", password: "study-2026", days: 30, allowance: 20000 });
await expect("guests POST: a short password is refused", guests.POST, 400, /password/i, { loginId: "guest", password: "abc", days: 30, allowance: 20000 });
const byId = await expect("guests POST: a user ID with a chosen password is made, no email needed", guests.POST, 200, null, { loginId: "Guest", password: "study-2026", days: 365, allowance: 20000 });
const idRow = (tables.students ?? []).find((s) => s.login_id === "guest");
check("guests POST: the ID is stored in lowercase with a stand-in login address", Boolean(idRow) && String(idRow?.email).startsWith("guest@") && idRow?.guest_until !== null);
check("guests POST: the chosen password is neither returned nor stored", byId.json?.password === null && !JSON.stringify(idRow).includes("study-2026"));
await expect("guests POST: the same user ID twice is explained", guests.POST, 400, /user ID/i, { loginId: "guest", password: "study-2026", days: 30, allowance: 20000 });
process.env.OPEN_SIGNUPS = "false";
session.user = { ...(row as unknown as Student) };
await expect("private testing: a live guest is allowed in", library.GET, 200, null, undefined);
session.user = { ...(row as unknown as Student), guest_until: new Date(Date.now() - 1000).toISOString() };
await expect("private testing: an expired guest is refused", library.GET, 403, /doesn't have access/i, undefined);
process.env.OPEN_SIGNUPS = "true";
await expect("sign-ups open: an expired guest is still refused", library.GET, 403, /doesn't have access/i, undefined);

// ---- Generating: refused before any AI is used ----
fresh();
await expect("generate: unreadable body is explained", adhoc.POST, 400, /couldn't be read/i, undefined, { raw: "{broken" });
await expect("generate: nothing to answer is refused", adhoc.POST, 400, /Type a question/i, { prompt: "   " });
await expect("generate: too many photos are refused", adhoc.POST, 400, /photos/i, { prompt: "x", photos: Array.from({ length: 30 }, () => ({ data: "AAAA", mimeType: "image/jpeg" })) });
await expect("generate: a too-long question is refused, not cut off", adhoc.POST, 400, /too long/i, { prompt: "x".repeat(8_001) });
await expect("generate: too much attached text is refused, not cut off", adhoc.POST, 400, /too much text/i, { prompt: "Solve", attachedText: "y".repeat(60_001) });
await expect("generate: a photo that isn't an image is refused", adhoc.POST, 400, /picture|image|photo/i, { prompt: "x", photos: [{ data: "bm90IGFuIGltYWdl", mimeType: "image/jpeg" }] });

// ---- Generating: the whole path, with a stand-in for the AI ----
fresh(person({ role: "student" }));
tables.generated_documents = [];
pipeline.calls = 0;
const made = await expect("generate: a question is answered and saved", adhoc.POST, 200, null, { prompt: "Explain photosynthesis" });
check("generate: the answer carries its text, an id and a PDF link", made.json?.text === "Plants make food." && typeof made.json?.id === "string" && /\/pdf$/.test(String(made.json?.pdfUrl)));
check("generate: the answer carries its two confidence numbers, and they are saved", (made.json?.confidence as { correct: number; fromBook: number } | undefined)?.correct === 91 && (made.json?.confidence as { fromBook: number }).fromBook === 88 && ((tables.generated_documents ?? [])[0].confidence as { correct: number } | undefined)?.correct === 91, JSON.stringify(made.json?.confidence));
check("generate: it is saved with a fingerprint for reuse", (tables.generated_documents ?? []).length === 1 && Boolean((tables.generated_documents ?? [])[0].cache_key) && (tables.generated_documents ?? [])[0].title === "Explain photosynthesis");
const again = await expect("generate: the same question again returns the saved answer", adhoc.POST, 200, null, { prompt: "Explain photosynthesis" });
check("generate: a reused answer keeps its confidence", (again.json?.confidence as { fromBook: number } | undefined)?.fromBook === 88, JSON.stringify(again.json?.confidence));
check("generate: no second AI call, and it says it was reused", pipeline.calls === 1 && Boolean(again.json?.reusedFrom));
tables.chunks = [{ owner_id: person().id, document_id: "b1", content: "Re-read page", page_number: 1, created_at: new Date(Date.now() + 60_000).toISOString() }];
const afterReread = await expect("generate: after a book page is re-read, the same question is answered again", adhoc.POST, 200, null, { prompt: "Explain photosynthesis" });
check("generate: an answer older than the re-read is not reused", pipeline.calls === 2 && !afterReread.json?.reusedFrom);
tables.chunks = [];
await expect("generate: a fresh answer can be asked for", adhoc.POST, 200, null, { prompt: "Explain photosynthesis", fresh: true });
check("generate: fresh makes another AI call and another copy", pipeline.calls === 3 && (tables.generated_documents ?? []).length === 3);
const streamed = await adhoc.POST(new Request("http://test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "A different question", stream: true }) }));
const lines = (await streamed.text()).trim().split("\n").map((l) => JSON.parse(l));
check("generate: a streamed answer sends text pieces, then the finished answer", streamed.headers.get("content-type")?.includes("ndjson") === true && lines.filter((l) => l.type === "text").map((l) => l.delta).join("") === "Plants make food." && lines.at(-1)?.type === "done" && lines.at(-1)?.answer?.text === "Plants make food.");
pipeline.fail = true;
const failed = await adhoc.POST(new Request("http://test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Another question", stream: true }) }));
const failLines = (await failed.text()).trim().split("\n").map((l) => JSON.parse(l));
check("generate: a failure inside a stream arrives as an error line", failLines.at(-1)?.type === "error" && /Couldn't make your answer/.test(String(failLines.at(-1)?.error)));
await expect("generate: a failure without streaming is a plain error", adhoc.POST, 500, /Couldn't make your answer/i, { prompt: "Yet another question" });
pipeline.fail = false;

// ---- The request gate (middleware): who may open which address ----
{
  let n = 0;
  const gate = async (path: string, who: { person?: Partial<Student> & { id?: string }; row?: boolean; outage?: boolean } | null) => {
    resetDb();
    ssrState.token = null;
    if (who) {
      const id = `00000000-0000-4000-8000-9${String(++n).padStart(11, "0")}`;
      ssrState.token = `token-${id}`;
      ssrState.sub = id;
      if (who.row !== false) tables.students = [person({ id, ...who.person }) as unknown as Record<string, unknown>];
      if (who.outage) failures.push({ table: "students", message: "database down" });
    }
    const res = await updateSession(new NextRequest(`http://test${path}`));
    return { status: res.status, to: res.headers.get("location") ? new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search : null, body: res.status === 200 || res.status === 401 || res.status === 503 ? await res.clone().text().catch(() => "") : "" };
  };
  process.env.OPEN_SIGNUPS = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "x";
  const out = await gate("/dashboard", null);
  check("gate: signed out, a page goes to sign-in and remembers where", out.status === 307 && out.to === "/login?next=%2Fdashboard", `${out.status} ${out.to}`);
  const api = await gate("/api/library", null);
  check("gate: signed out, an API call gets a JSON message, not a redirect", api.status === 401 && /sign in again/i.test(api.body), `${api.status} ${api.body}`);
  check("gate: sign-in, sign-up and the job runner are open to anyone", (await gate("/login", null)).status === 200 && (await gate("/signup", null)).status === 200 && (await gate("/api/jobs", null)).status === 200 && (await gate("/reset-password", null)).status === 200);
  check("gate: an approved person gets in", (await gate("/dashboard", { person: { active: true } })).status === 200);
  const pending = await gate("/dashboard", { person: { active: false } });
  check("gate: an account without access goes to the waiting page", pending.status === 307 && pending.to === "/pending", `${pending.status} ${pending.to}`);
  const noRow = await gate("/dashboard", { row: false });
  check("gate: someone with a login but no account row goes to the waiting page", noRow.status === 307 && noRow.to === "/pending", `${noRow.status} ${noRow.to}`);
  const down = await gate("/dashboard", { person: {}, outage: true });
  check("gate: a database outage is a 503 with a plain message, not a refusal", down.status === 503 && /can't reach its database/i.test(down.body), `${down.status} ${down.body}`);
  const adminPage = await gate("/admin/students", { person: { role: "student" } });
  check("gate: a normal account is sent away from the admin pages", adminPage.status === 307 && adminPage.to === "/dashboard", `${adminPage.status} ${adminPage.to}`);
  check("gate: an admin may open them", (await gate("/admin/students", { person: { role: "admin" } })).status === 200);
  const again = await gate("/login", { person: {} });
  check("gate: someone already signed in is sent from sign-in to the dashboard", again.status === 307 && again.to === "/dashboard", `${again.status} ${again.to}`);
  process.env.OPEN_SIGNUPS = "false";
  const closed = await gate("/dashboard", { person: { role: "student" } });
  check("gate: with sign-ups closed, only admins get in", closed.status === 307 && closed.to === "/pending" && (await gate("/dashboard", { person: { role: "admin" } })).status === 200, `${closed.status} ${closed.to}`);
  check("gate: a live guest gets in while sign-ups are closed; an expired guest does not", (await gate("/dashboard", { person: { role: "student", guest_until: new Date(Date.now() + 86_400_000).toISOString() } })).status === 200 && (await gate("/dashboard", { person: { role: "student", guest_until: new Date(Date.now() - 1000).toISOString() } })).to === "/pending");
  check("gate: API calls leave the account check to each route", (await gate("/api/library", { person: { active: false } })).status === 200);
  process.env.OPEN_SIGNUPS = "true";
}

// ---- Study packs: the whole path, with a stand-in for the AI ----
{
  const CHAPTER = "Plants make food from sunlight in their leaves. This is called photosynthesis. ".repeat(4);
  const BOOK = "00000000-0000-4000-8000-0000000000b1";
  const setup = (status = "ready", text = CHAPTER) => {
    fresh(person({ role: "student" }));
    tables.documents = [{ id: BOOK, owner_id: person().id, title: "Science Ch 2", status }];
    tables.chunks = [{ document_id: BOOK, content: text, page_number: 3, chunk_index: 0, created_at: new Date().toISOString() }];
    tables.generated_documents = [];
    fakeAi.calls = 0;
    fakeAi.reply = (req) =>
      req.systemInstructions === WALKTHROUGH_SYSTEM
        ? { text: JSON.stringify({ title: "Photosynthesis", subject: "Science", kind: "information", language: "en", overview: "How plants eat.", themes: ["Growth"], walkthrough: [{ title: "Leaves", summary: "Leaves make food.", whyItMatters: "Food", vocabulary: [{ word: "photosynthesis", meaning: "making food" }], narration: "Leaves make food.", scene: { backdrop: "forest", actors: [{ emoji: "🌳", motion: "sway" }], caption: "A tree" } }] }) }
        : req.systemInstructions === QUESTIONS_SYSTEM
          ? { text: JSON.stringify({ textbookQuestions: [{ number: "1", question: "What do plants make?", answer: "Food", evidence: "Plants make food from sunlight in their leaves.", type: "short answer" }], practiceQuestions: [{ question: "Name the process.", answer: "Photosynthesis", difficulty: "easy", skill: "recall", type: "short answer" }] }) }
          : { text: "{}" };
  };
  setup();
  const made = await expect("study pack: a chapter from My books becomes a pack", studyPack.POST, 200, null, { documentId: BOOK });
  const pack = made.json?.pack as { title: string; walkthrough: unknown[]; textbookQuestions: { evidenceFound: boolean | null }[]; practiceQuestions: unknown[]; glossary: { word: string }[] } | undefined;
  check("study pack: it has the walkthrough, questions, glossary and a title", pack?.title === "Photosynthesis" && pack.walkthrough.length === 1 && pack.textbookQuestions.length === 1 && pack.practiceQuestions.length === 1 && pack.glossary[0]?.word === "photosynthesis", JSON.stringify(pack)?.slice(0, 120));
  check("study pack: a quote from the chapter is checked and found", pack?.textbookQuestions[0].evidenceFound === true);
  check("study pack: it is saved, with its fingerprint, and uses two AI calls", (tables.generated_documents ?? []).length === 1 && (tables.generated_documents ?? [])[0].task_type === "study_pack" && Boolean((tables.generated_documents ?? [])[0].cache_key) && fakeAi.calls === 2, `${(tables.generated_documents ?? []).length} ${fakeAi.calls}`);
  const reused = await expect("study pack: the same chapter again returns the saved pack", studyPack.POST, 200, null, { documentId: BOOK });
  check("study pack: no new AI calls, and it says it was reused", fakeAi.calls === 2 && Boolean(reused.json?.reusedFrom));
  tables.chunks = tables.chunks.map((c) => ({ ...c, owner_id: person().id, created_at: new Date(Date.now() + 60_000).toISOString() }));
  const reread = await expect("study pack: after the chapter is re-read, the pack is made again", studyPack.POST, 200, null, { documentId: BOOK });
  check("study pack: a pack older than the re-read is not reused", fakeAi.calls === 4 && !reread.json?.reusedFrom);
  await expect("study pack: a fresh pack can be asked for", studyPack.POST, 200, null, { documentId: BOOK, fresh: true });
  check("study pack: fresh makes two more AI calls and another copy", fakeAi.calls === 6 && (tables.generated_documents ?? []).length === 3);

  setup("processing");
  await expect("study pack: a book still being read is explained", studyPack.POST, 400, /still being read/i, { documentId: BOOK });
  setup();
  await expect("study pack: someone else's or a missing book is not found", studyPack.POST, 400, /wasn't found/i, { documentId: "00000000-0000-4000-8000-0000000000ff" });
  setup("ready", "Too short.");
  await expect("study pack: a chapter with almost no text is refused", studyPack.POST, 400, /Choose a book/i, { documentId: BOOK });
  setup("ready", "x".repeat(160_000));
  await expect("study pack: a chapter that is too long asks for a shorter part", studyPack.POST, 400, /too long for one study pack/i, { documentId: BOOK });
  setup();
  fakeAi.reply = () => ({ text: "not json at all" });
  await expect("study pack: an unreadable AI reply is explained", studyPack.POST, 400, /couldn't be read/i, { documentId: BOOK });
  fakeAi.reply = () => ({ text: "{", truncated: true });
  await expect("study pack: a cut-off AI reply says the pack was too long", studyPack.POST, 400, /too long to finish/i, { documentId: BOOK });
  fakeAi.reply = () => ({ text: "{}" });
  await expect("study pack: an empty pack is refused", studyPack.POST, 400, /couldn't make a pack/i, { documentId: BOOK });
  check("study pack: nothing is saved when the pack fails", (tables.generated_documents ?? []).length === 0);
  setup();
  rpcs.student_monthly_usage = () => 999_999_999;
  const over = await studyPack.POST(new Request("http://test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId: BOOK }) }));
  check("study pack: over the monthly allowance is refused before any AI call", over.status >= 400 && fakeAi.calls === 0, `${over.status} ${fakeAi.calls}`);
}

// ---- Health check ----
fresh();
session.user = person();
await expect("health: a normal account gets 403", health.POST, 403, /admin/i, {});
session.user = person({ role: "admin" });
{
  const res = await call(health.POST, {});
  const checks = (res.json?.checks ?? []) as { name: string; ok: boolean; skipped?: boolean; detail: string }[];
  check("health: every service is checked in order", checks.map((c) => c.name).join("|").startsWith("Settings (environment variables)|Database|AI answers (Gemini)|AI with Google Search|Book search (embeddings)|File storage (Cloudflare R2)|Reading book pages (AI)|Background page reading"), checks.map((c) => c.name).join("|"));
}

// ---- Downloading a book ----
fresh();
session.user = person();
{
  const dl = (id: string) => call(bookDownload.GET, undefined, { id });
  const raw = async (id: string) => (bookDownload.GET as unknown as Handler)(new Request("http://localhost/x"), { params: Promise.resolve({ id }) });
  check("download: a signed-out person is refused", await (async () => { session.user = null; const r = await dl(BOOK); session.user = person(); return r.status === 401; })());
  check("download: a book id that isn't one is not found", (await dl("nope")).status === 404);
  check("download: someone else's book is not found", await (async () => { tables.documents = [{ id: BOOK, owner_id: OTHER, title: "Theirs" }]; return (await dl(BOOK)).status === 404; })());
  tables.documents = [{ id: BOOK, owner_id: ME, title: "Science Class 8" }];
  tables.chunks = [];
  files.clear();
  const empty = await dl(BOOK);
  check("download: a book with no saved pages says so", empty.status === 404 && /no saved pages/i.test(String(empty.json?.error)), JSON.stringify(empty));
  files.set(`sources/${BOOK}/page-2.jpg`, { data: Buffer.from("two"), contentType: "image/jpeg" });
  files.set(`sources/${BOOK}/page-1.png`, { data: Buffer.from("one"), contentType: "image/png" });
  tables.chunks = [
    { document_id: BOOK, page_number: 1, chunk_index: 0, content: "words already on picture 1" },
    { document_id: BOOK, page_number: 3, chunk_index: 1, content: "second part" },
    { document_id: BOOK, page_number: 3, chunk_index: 0, content: "first part" },
  ];
  madePdfs.length = 0;
  const res = await raw(BOOK);
  check("download: a PDF is sent as a file with the book's name", res.status === 200 && res.headers.get("content-type") === "application/pdf" && /attachment; filename="Science Class 8\.pdf"/.test(res.headers.get("content-disposition") ?? ""), String(res.status));
  const pages = madePdfs[0]?.pages ?? [];
  check("download: pages are in order, pictures for photos and text for Word pages", pages.map((p) => p.number).join() === "1,2,3" && Boolean(pages[0].image) && Boolean(pages[1].image) && pages[2].text === "first part\n\nsecond part", JSON.stringify(pages.map((p) => [p.number, Boolean(p.image), p.text])));
  check("download: a page with a picture doesn't repeat its words", !pages.some((p) => p.number === 1 && p.text));
  const order = arrangeBookPages(["sources/b/page-10.jpg", "sources/b/page-9.webp"], []);
  check("download: page 10 comes after page 9", order.map((p) => p.number).join() === "9,10");
}

// ---- Finding a whole exercise ----
fresh();
{
  check("pages: 'page 45' names one page", namedPages("Solve the sums on page 45").join() === "45");
  check("pages: 'pages 12 to 14' is a range", namedPages("answer pages 12 to 14").join() === "12,13,14");
  check("pages: 'pages 3 and 5' is two pages, not a range", namedPages("pages 3 and 5 please").join() === "3,5");
  check("pages: a huge range is cut short", namedPages("pages 1-500").length === 12);
  check("pages: no page named", namedPages("What is photosynthesis?").length === 0);
  check("pages: 'page 11 to page 16' is a range", namedPages("solve from page 11 to page 16").join() === "11,12,13,14,15,16");
  check("pages: a list of pages", namedPages("pages 5, 6 and 7").join() === "5,6,7");
  check("pages: a range and another page", namedPages("pages 11-13 and 20").join() === "11,12,13,20");
  check("pages: marks after 'and' are not a page", namedPages("Solve Q5 on page 12 and 15 marks").join() === "12");
  check("exercise: asking for an exercise wants the whole section", wantsWholeSection("Solve Exercise 3.2") && !wantsWholeSection("What is a prime number?"));

  const row = (id: string, doc: string, page: number, index: number, owner = ME) => ({ id, document_id: doc, owner_id: owner, page_number: page, chunk_index: index, content: `${id} text`, section_label: `Page ${page}`, source_type: "textbook", image_path: null });
  tables.chunks = [
    row("p4a", BOOK, 4, 0), row("p4b", BOOK, 4, 1), row("p4c", BOOK, 4, 2),
    row("p5a", BOOK, 5, 0), row("p5b", BOOK, 5, 1), row("p6a", BOOK, 6, 0),
    row("other", OTHER, 4, 0, OTHER), row("theirs", BOOK, 4, 3, OTHER),
  ];
  rpcs.match_owner_chunks = () => [{ ...tables.chunks[0], similarity: 0.8 }];
  const ids = async (q: string) => (await retrieveContext(q, { ownerId: ME })).chunks.map((c) => c.id).join();
  check("whole exercise: a plain question gets only the closest passage", (await ids("What is a prime number?")) === "p4a");
  check("whole exercise: with no pages marked as Exercise, the match's page and the next five are added, in order, none of anyone else's", (await ids("Solve Exercise 4.1")) === "p4a,p4b,p4c,p5a,p5b,p6a", await ids("Solve Exercise 4.1"));
  check("whole exercise: a named page is fetched whole", (await ids("Do page 6")) === "p4a,p6a", await ids("Do page 6"));

  // A 16-page book: pages 1 to 10 are the textbook, 11 to 16 the exercise (marked when it was uploaded).
  const page = (n: number, type: string) => [0, 1].map((k) => ({ ...row(`b${n}-${k}`, BOOK, n, k), source_type: type }));
  tables.chunks = Array.from({ length: 16 }, (_, i) => page(i + 1, i < 10 ? "textbook" : "exercise")).flat();
  rpcs.match_owner_chunks = () => [{ ...tables.chunks.find((c) => c.id === "b13-0")!, similarity: 0.7 }];
  const pagesOf = async (q: string) => [...new Set((await retrieveContext(q, { ownerId: ME })).chunks.map((c) => Number(c.page_number)))].sort((a, b) => a - b).join();
  check("whole exercise: pages marked Exercise (11 to 16) all come, and no textbook page is added", (await pagesOf("Solve the exercise")) === "11,12,13,14,15,16", await pagesOf("Solve the exercise"));
  check("whole exercise: a named stretch (pages 12 to 14) still wins over the marking", (await pagesOf("Do pages 12 to 14")) === "12,13,14", await pagesOf("Do pages 12 to 14"));
  delete rpcs.match_owner_chunks;

  // Question boxes in the lesson are fetched too, ahead of the exercise, but only for a whole-exercise request.
  const box = (id: string, page: number, label: string) => ({ ...row(id, BOOK, page, 0), source_type: "textbook", section_label: label, content: `${label} questions` });
  tables.chunks = [
    box("warm", 2, "[Questions: Warm-up]"), box("lesson-text", 2, "Introduction"), box("mirabai", 3, "[Questions: 21st Century Skills]"),
    box("source", 4, "[Questions: Source Analysis]"), { ...row("ex1", BOOK, 11, 0), source_type: "exercise" }, { ...row("ex2", BOOK, 12, 0), source_type: "exercise" },
  ];
  rpcs.match_owner_chunks = () => [{ ...tables.chunks[5], similarity: 0.7 }];
  const withBoxes = (await retrieveContext("Answer all questions in the chapter", { ownerId: ME })).chunks.map((c) => c.id).join();
  check("lesson questions: Warm-up, 21st Century Skills and Source Analysis boxes come with the exercise, not the plain lesson text", withBoxes === "ex2,warm,mirabai,source,ex1", withBoxes);
  const plainAsk = (await retrieveContext("What is Bhakti?", { ownerId: ME })).chunks.map((c) => c.id).join();
  check("lesson questions: an ordinary question doesn't pull them in", plainAsk === "ex2", plainAsk);
  const named2 = (await retrieveContext("Do page 12", { ownerId: ME })).chunks.map((c) => c.id).join();
  check("lesson questions: a named page doesn't either", named2 === "ex2", named2);
  delete rpcs.match_owner_chunks;

  // Pictures: a whole exercise sends the pictures of its pages first, and has room for more of them.
  const withPicture = (n: number, sim: number) => ({ id: `i${n}`, document_id: BOOK, content: "t", section_label: null, page_number: n, source_type: "exercise", image_path: `sources/${BOOK}/page-${n}.jpg`, similarity: sim });
  for (let n = 1; n <= 16; n++) files.set(`sources/${BOOK}/page-${n}.jpg`, { data: Buffer.from(String(n)), contentType: "image/jpeg" });
  const plain = await loadSourceImages([1, 2, 3, 4, 5, 6].map((n) => withPicture(n, 0.8)));
  check("pictures: an ordinary answer gets at most 4 page pictures", plain.images.length === 4, String(plain.images.length));
  const section = await loadSourceImages([...[1, 2].map((n) => withPicture(n, 0.8)), ...[11, 12, 13, 14, 15, 16].map((n) => withPicture(n, 0))]);
  check("pictures: a whole exercise sends all its pages' pictures first (6 pages + 2 best matches)", section.images.length === 8 && [11, 12, 13, 14, 15, 16].every((n) => section.byPath.has(`sources/${BOOK}/page-${n}.jpg`)), [...section.byPath.keys()].join());
}

// ---- Scan confidence ----
fresh();
{
  const lines = Array.from({ length: 28 }, (_, i) => `<text x="40" y="${60 + i * 34}" font-size="22" font-family="DejaVu Sans, Arial, sans-serif">${i + 1}. The Alvars were devoted to Vishnu and the Nayanars to Shiva.</text>`).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1100"><rect width="100%" height="100%" fill="white"/>${lines}</svg>`);
  const page = await sharp(svg).jpeg({ quality: 85 }).toBuffer();
  const sharpStats = (await measureImage(page))!;
  const blurStats = (await measureImage(await sharp(page).blur(3).jpeg().toBuffer()))!;
  const darkStats = (await measureImage(await sharp(page).linear(0.3, 0).jpeg().toBuffer()))!;
  const smallStats = (await measureImage(await sharp(page).resize({ width: 380 }).jpeg().toBuffer()))!;
  const text = "Q1. Fill in the blanks.\n1. The Alvars were devoted to Vishnu.\n2. The Nayanars were devoted to Shiva.\nPage: 11";

  const good = scorePage({ text, image: sharpStats, legibility: "clear" });
  check("scan: a sharp, bright page with clean text scores high with no issues", good.score >= 95 && good.issues.length === 0, JSON.stringify(good));
  const blurry = scorePage({ text, image: blurStats, legibility: null });
  check("scan: a blurred page is flagged blurry and scores weak", blurry.issues.includes("blurry") && blurry.score < 60, JSON.stringify(blurry));
  check("scan: a dark page is flagged", scorePage({ text, image: darkStats, legibility: null }).issues.includes("too_dark"));
  check("scan: a tiny picture is flagged low resolution", scorePage({ text, image: smallStats, legibility: null }).issues.includes("low_resolution"));
  check("scan: text that came with the file (no picture) is not judged on a picture", scorePage({ text, image: null, legibility: null }).score === 100);
  check("scan: the reader saying 'poor' caps the page at 45", scorePage({ text, image: sharpStats, legibility: "poor" }).score <= 45);
  const gaps = scorePage({ text: `${text}\nThe [illegible] was [illegible] by [illegible] at [illegible]`, image: sharpStats, legibility: "fair" });
  check("scan: [illegible] words cost points and are named", gaps.score <= 70 && gaps.issues.includes("illegible_words"), JSON.stringify(gaps));
  check("scan: garbled text is flagged", scorePage({ text: "�����������������������������������������������������", image: sharpStats, legibility: null }).issues.includes("garbled"));
  check("scan: Hindi and maths symbols are normal text, not garbage", scorePage({ text: "जाति न पूछे साधु की, पूछ लीजिये ज्ञान। मोल करो तरवार का, पड़ा रहन दो म्यान॥ 5 × 3 = 15, √4 = 2, ½ + ¼ ≤ ₹10", image: sharpStats, legibility: null }).score === 100);
  check("scan: an empty page is 'blank' at 55, not an error", JSON.stringify(scorePage({ text: "[EMPTY PAGE]", image: sharpStats, legibility: null })) === '{"score":55,"issues":["blank"]}');
  check("scan: a short page in a good picture (a heading or diagram) is not weak", scorePage({ text: "## Timeline\nFig. 1.1", image: sharpStats, legibility: "clear" }).score >= 80);
  const taken = takeLegibility("Some text\nPage: 3\n[Legibility: fair]");
  check("scan: the legibility line is taken out of the page text", taken.legibility === "fair" && taken.text === "Some text\nPage: 3" && takeLegibility("plain").legibility === null);

  const book = (average: number, weak: number[], pages: number, failed = 0) => summariseBook({ pages, average, weak_pages: weak, issues: ["blurry", "too_dark"] }, { total: pages + failed, failed });
  check("scan: clean pages make a High book with no advice", book(93, [], 15).level === "high" && book(93, [], 15).advice === null);
  const one = book(92, [4], 15);
  check("scan: one weak page keeps the book Medium and names the page", one.level === "medium" && /Page 4 is unclear/.test(one.advice ?? "") && /re-scan/i.test(one.advice ?? ""), one.advice ?? "");
  const low = book(50, [2, 4, 6, 8, 9, 11], 15);
  check("scan: a poor average is Low, asks for a re-scan and lists the pages", low.level === "low" && /Low confidence/.test(low.advice ?? "") && /pages 2, 4, 6, 8, 9, 11/.test(low.advice ?? ""), low.advice ?? "");
  check("scan: many weak pages make the book Low even when the average is decent", book(78, [1, 2, 3, 4, 5], 15).level === "low");
  const lost = book(95, [], 10, 5);
  check("scan: pages that could not be read pull the score down and are counted", lost.score === 63 && lost.failedPages === 5 && lost.level === "low", JSON.stringify(lost));
  check("scan: the issues are in plain words", /out of focus/.test(book(60, [1], 3).problems.join()) && /too dark/.test(book(60, [1], 3).problems.join()));

  // The book list carries the score of a ready book.
  session.user = person();
  tables.documents = [{ id: BOOK, owner_id: ME, title: "History", status: "ready", subject: null, grade: null, source_type: "textbook", created_at: "2026-10-01" }];
  rpcs.page_job_counts = () => [{ document_id: BOOK, status: "done", jobs: 15 }];
  rpcs.page_read_summary = () => [{ document_id: BOOK, pages: 15, average: "91.4", weak_pages: [4], issues: ["blurry"] }];
  const listed = await (library.GET as unknown as (r: Request) => Promise<Response>)(new Request("http://localhost/api/library"));
  const body = (await listed.json()) as { documents: { scan: { level: string; weakPages: number[] } | null }[] };
  check("scan: a ready book in the list carries its scan score and weak pages", body.documents[0].scan?.level === "medium" && body.documents[0].scan.weakPages.join() === "4", JSON.stringify(body));
  failures.length = 0;
  rpcs.page_read_summary = () => { throw new Error("db down"); };
  const degraded = await (library.GET as unknown as (r: Request) => Promise<Response>)(new Request("http://localhost/api/library"));
  check("scan: if the score can't be worked out the books still list, without it", degraded.status === 200 && ((await degraded.json()) as { documents: { scan: unknown }[] }).documents[0].scan === null);
  delete rpcs.page_job_counts;
  delete rpcs.page_read_summary;

  // Scoring a book that was read before scores were kept: pictures are measured, Word pages judged on their text, no AI used.
  const check1 = (id: string) => call(scanCheck.POST, undefined, { id });
  check("scan check: a book id that isn't one is not found", (await check1("nope")).status === 404);
  tables.documents = [{ id: BOOK, owner_id: OTHER, title: "Theirs" }];
  check("scan check: someone else's book is not found", (await check1(BOOK)).status === 404);
  tables.documents = [{ id: BOOK, owner_id: ME, title: "History" }];
  files.clear();
  tables.chunks = [];
  check("scan check: a book with no saved pages says so", (await check1(BOOK)).status === 404);
  files.set(`sources/${BOOK}/page-1.jpg`, { data: page, contentType: "image/jpeg" });
  files.set(`sources/${BOOK}/page-2.jpg`, { data: await sharp(page).blur(3).jpeg().toBuffer(), contentType: "image/jpeg" });
  tables.chunks = [
    { document_id: BOOK, page_number: 1, chunk_index: 0, content: text },
    { document_id: BOOK, page_number: 2, chunk_index: 0, content: text },
    { document_id: BOOK, page_number: 3, chunk_index: 0, content: text },
  ];
  tables.page_reads = [];
  const checked = await check1(BOOK);
  const reads = (tables.page_reads ?? []) as { page_number: number; confidence: number; issues: string[]; owner_id: string }[];
  const byPage = (n: number) => reads.find((r) => r.page_number === n);
  check("scan check: every saved page gets a score and the book's owner", checked.status === 200 && reads.length === 3 && reads.every((r) => r.owner_id === ME), JSON.stringify(checked));
  check("scan check: a sharp page scores high, a blurred one low and flagged", (byPage(1)?.confidence ?? 0) >= 95 && (byPage(2)?.confidence ?? 100) < 60 && byPage(2)?.issues.includes("blurry") === true, JSON.stringify(reads));
  check("scan check: a text-only (Word) page is scored on its text", byPage(3)?.confidence === 100);
  await check1(BOOK);
  check("scan check: running it again replaces the scores, not adds", (tables.page_reads ?? []).length === 3);
}

// ---- Handwritten answers ----
{
  const context = formatContext([{ id: "h1", document_id: BOOK, content: HANDWRITTEN_PAGE, section_label: "[Questions: Think and Answer]", page_number: 5, source_type: "exercise", image_path: null, similarity: 0.8 }]);
  const [printed, attempt1] = context.split("[Student's handwritten attempt");
  check("handwriting: the printed questions reach the AI without the student's answers inside them", printed.includes("Which type of soil do you think it will be?") && !/Black Soil|Red Soil|Cotton/.test(printed), printed.slice(0, 300));
  check("handwriting: the answers are given apart, labelled reference-only and never-copy", attempt1 !== undefined && /for reference only/.test(attempt1) && /Never copy it/.test(attempt1) && /Black Soil/.test(attempt1));
  check("handwriting: a chunk with none is passed on as it was", formatContext([{ id: "h2", document_id: BOOK, content: "Plain printed text.", section_label: null, page_number: 1, source_type: "textbook", image_path: null, similarity: 0.9 }]).endsWith("Plain printed text."));
}

// ---- Problem reports ----
fresh();
{
  const REPORT = "55555555-5555-4555-8555-555555555555";
  session.user = null;
  await expect("reports: signed out is refused", reports.POST, 401, null, { title: "x" });
  session.user = person();
  await expect("reports: a missing title is explained", reports.POST, 400, /short title/i, { title: " ", context: {} });
  await expect("reports: an over-long description is refused", reports.POST, 400, /too long/i, { title: "x", description: "y".repeat(5001) });
  const made = await expect("reports: a report is saved and numbered", reports.POST, 200, null, {
    title: "Answer skipped Q4",
    description: "Expected 8 answers",
    path: "/dashboard",
    build: "abc",
    context: { requests: [{ method: "POST", path: "/api/generate/solution", sent: "{}", password: "hunter2" }], steps: [{ at: "t", kind: "click", text: "Clicked Generate" }] },
  });
  const saved = ((tables.bug_reports ?? []) as { id: string; student_id: string; title: string; context: { requests: { password: string }[] } }[])[0];
  check("reports: it belongs to the person who raised it, and a password sent inside is hidden", saved?.student_id === ME && saved.title === "Answer skipped Q4" && saved.context.requests[0].password === "[hidden]", JSON.stringify(saved));
  check("reports: the number comes back for the person", typeof made.json?.id === "string");

  // 20 a day.
  tables.bug_reports = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, student_id: ME, created_at: new Date().toISOString(), title: "t" }));
  await expect("reports: the 21st in a day is refused", reports.POST, 429, /most for one day/i, { title: "one more", context: {} });
  tables.bug_reports = [
    { id: REPORT, number: 7, student_id: ME, title: "Mine", description: "d", path: "/x", app_build: "b", status: "open", created_at: "2026-10-20T10:00:00Z", resolution: null, context: { userAgent: "UA", steps: [], requests: [] } },
    { id: "66666666-6666-4666-8666-666666666666", number: 8, student_id: OTHER, title: "Theirs", description: "", path: "/y", app_build: "b", status: "open", created_at: "2026-10-20T11:00:00Z", resolution: null, context: {} },
  ];
  const list = await (reports.GET as unknown as (r: Request) => Promise<Response>)(new Request("http://localhost/api/bug-reports"));
  const mine = ((await list.json()) as { reports: { title: string }[] }).reports;
  check("reports: a person sees only their own reports", mine.length === 1 && mine[0].title === "Mine", JSON.stringify(mine));
  const forbidden = await (reports.GET as unknown as (r: Request) => Promise<Response>)(new Request("http://localhost/api/bug-reports?all=1"));
  check("reports: asking for everyone's is for admins only", forbidden.status === 403);
  const one = await call(report.GET, undefined, { id: REPORT });
  check("reports: a person can open their own report, with its ticket text", one.status === 200 && String(one.json?.markdown).includes("# Bug #7: Mine"));
  check("reports: not someone else's", (await call(report.GET, undefined, { id: "66666666-6666-4666-8666-666666666666" })).status === 404);
  await expect("reports: a person cannot change a status", report.PATCH, 403, /admin/i, { status: "fixed" }, { id: REPORT });

  session.user = person({ role: "admin" });
  const all = await (reports.GET as unknown as (r: Request) => Promise<Response>)(new Request("http://localhost/api/bug-reports?all=1"));
  check("reports: an admin sees everyone's", ((await all.json()) as { reports: unknown[] }).reports.length === 2);
  check("reports: an admin can open anyone's", (await call(report.GET, undefined, { id: "66666666-6666-4666-8666-666666666666" })).status === 200);
  await expect("reports: a bad status is refused", report.PATCH, 400, /Choose Open/i, { status: "banana" }, { id: REPORT });
  await expect("reports: an empty change is refused", report.PATCH, 400, /nothing to change/i, {}, { id: REPORT });
  await expect("reports: an unknown report is not found", report.PATCH, 404, null, { status: "fixed" }, { id: "77777777-7777-4777-8777-777777777777" });
  await expect("reports: an admin sets fixed with a note", report.PATCH, 200, null, { status: "fixed", resolution: "Raised the limit." }, { id: REPORT });
  const after = (tables.bug_reports as { id: string; status: string; resolution: string; resolved_at: string }[]).find((r) => r.id === REPORT)!;
  check("reports: the status, the note and the time it was resolved are saved", after.status === "fixed" && after.resolution === "Raised the limit." && typeof after.resolved_at === "string");
  await call(report.PATCH, { status: "open" }, { id: REPORT });
  check("reports: reopening clears the resolved time", (tables.bug_reports as { id: string; resolved_at: string | null }[]).find((r) => r.id === REPORT)!.resolved_at === null);
  session.user = person();
}

// ---- All selected books passed whole ----
fresh();
{
  const BOOK2 = "88888888-8888-4888-8888-888888888888";
  tables.documents = [
    { id: BOOK, owner_id: ME, title: "Geography Textbook", created_at: "2026-10-01" },
    { id: BOOK2, owner_id: ME, title: "Geography Exercises", created_at: "2026-10-02" },
    { id: "99999999-9999-4999-8999-999999999999", owner_id: ME, title: "History", created_at: "2026-10-03" },
  ];
  const row = (id: string, doc: string, page: number, index: number, type: string, content: string) => ({ id, document_id: doc, owner_id: ME, page_number: page, chunk_index: index, source_type: type, section_label: `Page ${page}`, image_path: `sources/${doc}/page-${page}.jpg`, content });
  tables.chunks = [
    row("e1", BOOK2, 2, 0, "exercise", "Q1. Name the layers of the Earth."),
    row("t2b", BOOK, 2, 1, "textbook", "The crust is the outermost layer."),
    row("t1", BOOK, 1, 0, "textbook", "The Earth has crust, mantle and core."),
    row("t2a", BOOK, 2, 0, "textbook", "Rocks are of three kinds."),
    row("h1", "99999999-9999-4999-8999-999999999999", 1, 0, "textbook", "History text that was not selected."),
  ];
  rpcs.match_owner_chunks = () => [{ ...tables.chunks[1], similarity: 0.6 }];
  const whole = await retrieveContext("What are the layers of the Earth?", { ownerId: ME, documentIds: [BOOK, BOOK2], fullContextChars: 10_000 });
  check("whole books: every passage of the selected books is passed, book by book, each in page order", whole.chunks.map((c) => c.id).join() === "t1,t2a,t2b,e1", whole.chunks.map((c) => c.id).join());
  check("whole books: a book that was not selected is left out", !whole.chunks.some((c) => c.id === "h1"));
  check("whole books: each passage carries its book's title", whole.chunks[0].book === "Geography Textbook" && whole.chunks[3].book === "Geography Exercises");
  check("whole books: it is recorded, and the books are judged covered", whole.stats.mode === "full" && whole.stats.books === 2 && whole.stats.totalChars > 100 && whole.coverageLow === false, JSON.stringify(whole.stats));
  check("whole books: the text given to the AI names the book of each passage", formatContext(whole.chunks).includes("— Geography Exercises — Page 2, p.2 — exercise"), formatContext(whole.chunks).slice(0, 200));
  const tight = await retrieveContext("What are the layers of the Earth?", { ownerId: ME, documentIds: [BOOK, BOOK2], fullContextChars: 50 });
  check("whole books: when they don't fit, the closest passages are used (with book titles) and the size is recorded", tight.stats.mode === "search" && tight.chunks.length === 1 && tight.chunks[0].book === "Geography Textbook" && tight.stats.totalChars > 100, JSON.stringify(tight.stats));
  const off = await retrieveContext("What are the layers of the Earth?", { ownerId: ME, documentIds: [BOOK] });
  check("whole books: with no budget given, nothing changes", off.stats.mode === "search");
  tables.chunks = [];
  const empty = await retrieveContext("anything", { ownerId: ME, documentIds: [BOOK], fullContextChars: 10_000 });
  check("whole books: books with no text fall back to the search", empty.stats.mode === "search");
  delete rpcs.match_owner_chunks;

  // Pictures: exercise pages first, up to the limit, whichever order the passages came in.
  tables.documents = [];
  for (let n = 1; n <= 12; n++) files.set(`sources/${BOOK}/page-${n}.jpg`, { data: Buffer.from(String(n)), contentType: "image/jpeg" });
  const mk = (n: number, type: string) => ({ id: `p${n}`, document_id: BOOK, content: "x", section_label: null, page_number: n, source_type: type, image_path: `sources/${BOOK}/page-${n}.jpg`, similarity: 1 });
  const imgs = await loadSourceImages([1, 2, 3, 4, 5, 6].map((n) => mk(n, "textbook")).concat([7, 8].map((n) => mk(n, "exercise"))), 4);
  const got = [...imgs.byPath.keys()].map((k) => Number(/page-(\d+)/.exec(k)![1])).sort((a, b) => a - b).join();
  check("whole books: the pictures sent are the exercise pages first (7, 8), then the earliest others", got === "1,2,7,8", got);
}

// ---- Whole exercise: lesson passages to answer it from ----
fresh();
{
  const row = (id: string, page: number, type: string, content: string) => ({ id, document_id: BOOK, owner_id: ME, page_number: page, chunk_index: 0, source_type: type, section_label: `Page ${page}`, image_path: null, content });
  tables.chunks = [
    row("ex1", 11, "exercise", "Q1. Fill in the blanks.\n1. The ____ worshipped Shiva in the linga form.\n2. The ____ were the most prominent Sufi silsila in India."),
    row("ex2", 12, "exercise", "Q2. Answer in short.\n1. Who was Basavanna?\n2. How did Guru Nanak simplify spirituality?"),
    row("t1", 3, "textbook", "Basavanna, a Virashaiva teacher, composed vachanas in Kannada."),
    row("t2", 6, "textbook", "Guru Nanak taught that devotion to one formless God was enough."),
  ];
  let call = 0;
  rpcs.match_owner_chunks = () => {
    call++;
    const sim = (id: string, similarity: number) => ({ ...tables.chunks.find((c) => c.id === id)!, similarity });
    // The request itself is generic: its own search matches only an exercise page, weakly. Each question's search finds its lesson passage (and the exercise page, which is not added twice).
    return call === 1 ? [sim("ex1", 0.3)] : [sim("ex1", 0.9), sim("t1", 0.8), sim("t2", 0.7)];
  };
  const result = await retrieveContext("Solve all exercise questions", { ownerId: ME });
  const ids = result.chunks.map((c) => c.id).join();
  check("exercise support: the exercise pages come whole and the lesson passages that answer them are added after", ids === "ex1,ex2,t1,t2", ids);
  check("exercise support: how it was found is recorded", result.stats.mode === "exercise" && result.stats.sectionChunks === 2 && result.stats.questions === 4 && result.stats.supportChunks === 2 && result.stats.topSimilarity === 0.3, JSON.stringify(result.stats));
  check("exercise support: the books cover the exercise when its questions found close passages", result.coverageLow === false);
  call = 0;
  rpcs.match_owner_chunks = () => (++call === 1 ? [{ ...tables.chunks[0], similarity: 0.3 }] : [{ ...tables.chunks[0], similarity: 0.9 }]);
  const none = await retrieveContext("Solve all exercise questions", { ownerId: ME });
  check("exercise support: with no lesson passage to be found, it says the books don't cover it", none.coverageLow === true && none.stats.supportChunks === 0 && none.chunks.length === 2, JSON.stringify(none.stats));
  rpcs.match_owner_chunks = () => [{ ...tables.chunks[2], similarity: 0.8 }];
  const plain = await retrieveContext("What is Bhakti?", { ownerId: ME });
  check("exercise support: an ordinary question is untouched", plain.stats.mode === "search" && plain.chunks.length === 1 && plain.stats.questions === 0, JSON.stringify(plain.stats));
  delete rpcs.match_owner_chunks;
}

// ---- Weak pages behind an answer ----
{
  tables.page_reads = [
    { document_id: BOOK, page_number: 4, confidence: 40, issues: ["blurry"] },
    { document_id: BOOK, page_number: 5, confidence: 95, issues: [] },
    { document_id: BOOK, page_number: 9, confidence: 30, issues: ["too_dark"] },
  ];
  const w = await countWeakPages([{ document_id: BOOK, page_number: 4 }, { document_id: BOOK, page_number: 5 }, { document_id: BOOK, page_number: null }]);
  check("confidence: only the weak pages the answer used are counted (page 9 wasn't used, page 5 is fine)", w === 1, String(w));
  check("confidence: no passages means no weak pages", (await countWeakPages([])) === 0);
  failures.push({ table: "page_reads", message: "db down" });
  check("confidence: if the page scores can't be read the answer is still scored", (await countWeakPages([{ document_id: BOOK, page_number: 4 }])) === 0);
  failures.length = 0;
}

// ---- Paper checker ----
fresh(person({ role: "student" }));
tables.generated_documents = [];
pipeline.calls = 0;
{
  await expect("paper check: nothing attached or typed is refused", paperCheck.POST, 400, /Type a question, or attach a photo/i, { prompt: "  " });
  await expect("paper check: too many pages are refused", paperCheck.POST, 400, /photos/i, { photos: Array.from({ length: 30 }, () => ({ data: "AAAA", mimeType: "image/jpeg" })) });
  const marked = await expect("paper check: typed working is marked and saved", paperCheck.POST, 200, null, { prompt: "1) 12 x 15 = 170\n\nMarks per question (set): 4", documentIds: [] });
  const row = (tables.generated_documents ?? [])[0] as { task_type: string; title: string; confidence: unknown } | undefined;
  check("paper check: it is saved as a paper check with its own title", row?.task_type === "paper_check" && /^Paper check: 1\) 12 x 15 = 170/.test(row.title), JSON.stringify(row));
  check("paper check: it is answered by the paper checker, not the book pipeline", pipeline.calls === 1 && typeof marked.json?.text === "string");
  fresh(null);
  await expect("paper check: a signed-out person is refused", paperCheck.POST, 401, null, { prompt: "x" });
}

// ---- Rules page ----
{
  const groups = ruleGroups();
  const prompts = new Map(allPrompts().map((p) => [p.key, p.text.toLowerCase()]));
  const rules = groups.flatMap((g) => g.rules);
  check("rules: groups have unique ids and every rule has text and a place in the code", new Set(groups.map((g) => g.id)).size === groups.length && rules.every((r) => r.text.trim() && r.where.trim()));
  const missing = rules.filter((r) => r.prompt && !prompts.get(r.prompt.to)?.includes(r.prompt.contains.toLowerCase()));
  check("rules: every instruction to the AI quotes a phrase that is really in its instructions", missing.length === 0, missing.map((r) => `${r.prompt?.to}: ${r.prompt?.contains}`).join(" | "));
  check("rules: the instructions are all non-empty", [...prompts.values()].every((t) => t.length > 100));
}

// ---- Background reader and error log ----
fresh();
tables.job_runner = [{ id: 1, token: "secret-token" }];
await expect("jobs: no token is refused", jobs.POST, 403, null, {}, {});
await expect("jobs: a wrong token (any length) is refused without crashing", jobs.POST, 403, null, {}, { headers: { "x-job-token": "x" } });
failures.length = 0;
{
  // A book whose owner has used this month's allowance waits instead of going over it.
  const BOOK = "00000000-0000-4000-8000-0000000000c1";
  fresh(person({ token_quota: 1000 }));
  rpcs.student_monthly_usage = () => 1000;
  tables.documents = [{ id: BOOK, owner_id: ME, title: "Big book", status: "processing", source_type: "textbook" }];
  const job = (page: number, status: string) => ({ id: `job-${page}`, document_id: BOOK, owner_id: ME, page_number: page, status, attempts: 0, error: null, page_text: "Some text", image_path: null, mime_type: null, hint: null, source_type: null, next_attempt_at: new Date(0).toISOString() });
  tables.page_jobs = [job(1, "done"), job(2, "pending")];
  rpcs.claim_page_job = () => {
    const next = (tables.page_jobs ?? []).find((j) => j.status === "pending" && String(j.next_attempt_at) <= new Date().toISOString());
    if (!next) return [];
    Object.assign(next, { status: "working", attempts: Number(next.attempts) + 1 });
    return [{ ...next }];
  };
  await readQueuedPages(null);
  const waiting = (tables.page_jobs ?? [])[1];
  check("allowance: a page over the monthly allowance waits, without counting a try", waiting.status === "pending" && waiting.attempts === 0 && Date.parse(String(waiting.next_attempt_at)) > Date.now() + 30 * 60_000, JSON.stringify(waiting));
  check("allowance: the pages already read can be used meanwhile (the book is Ready)", tables.documents[0].status === "ready");
  rpcs.page_job_counts = () => [{ document_id: BOOK, status: "done", jobs: 1 }, { document_id: BOOK, status: "pending", jobs: 1 }];
  const progress = (await pageProgress(ME))[BOOK];
  check("allowance: the book says it is paused for the allowance, not that a page has a problem", progress?.allowancePaused === true && progress.problems.length === 0, JSON.stringify(progress));
  rpcs.student_monthly_usage = () => 0;
  rpcs.replace_page_chunks = () => null;
  waiting.next_attempt_at = new Date(0).toISOString();
  await readQueuedPages(null);
  check("allowance: once there is allowance again, the page is read", waiting.status === "done", JSON.stringify(waiting));
  fresh();
}
await expect("log-error: a crash report is accepted", logError.POST, 200, null, { where: "dashboard page", message: "boom", path: "/dashboard" });
check("log-error: it is saved without secrets", (tables.error_log ?? []).length === 1);
await expect("log-error: an unreadable report is refused", logError.POST, 400, null, undefined, { raw: "nope" });

console.log(`\n${total - failures_} passed, ${failures_} failed`);
process.exit(failures_ ? 1 : 0);
