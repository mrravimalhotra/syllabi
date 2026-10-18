// Route tests: calls the real route handlers with a fake database and a fake
// signed-in person, and checks status codes and messages for signed-out,
// not-allowed, bad input, over-allowance and not-found cases.
import { session } from "./fakes/auth";
import { deleted, files } from "./fakes/storage";
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
import * as guests from "../../src/app/api/admin/guests/route";
import * as speech from "../../src/app/api/speech/route";
import * as sounds from "../../src/app/api/sounds/route";
import * as sound from "../../src/app/api/sounds/[letter]/route";
import * as logError from "../../src/app/api/log-error/route";
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
await expect("generate: a photo that isn't an image is refused", adhoc.POST, 400, /picture|image|photo/i, { prompt: "x", photos: [{ data: "bm90IGFuIGltYWdl", mimeType: "image/jpeg" }] });

// ---- Background reader and error log ----
fresh();
tables.job_runner = [{ id: 1, token: "secret-token" }];
await expect("jobs: no token is refused", jobs.POST, 403, null, {}, {});
await expect("jobs: a wrong token (any length) is refused without crashing", jobs.POST, 403, null, {}, { headers: { "x-job-token": "x" } });
failures.length = 0;
await expect("log-error: a crash report is accepted", logError.POST, 200, null, { where: "dashboard page", message: "boom", path: "/dashboard" });
check("log-error: it is saved without secrets", (tables.error_log ?? []).length === 1);
await expect("log-error: an unreadable report is refused", logError.POST, 400, null, undefined, { raw: "nope" });

console.log(`\n${total - failures_} passed, ${failures_} failed`);
process.exit(failures_ ? 1 : 0);
