# Syllabi — Full Handoff for the Cloud Session

> **Live (2026-10-17):** https://syllabi-study.vercel.app (Vercel project `syllabi`, Mumbai), Supabase `syllabi` (Mumbai), R2 bucket `syllabi`, Gemini key set. Private testing: `OPEN_SIGNUPS=false`, owner signed up and made admin. The old R2 bucket `studysprint` holds orphaned files from the deleted project and can be removed. Next: live tests in `docs/release-checklist.md`.

> **Status update (2026-10-17):** steps 1–3 of section 12 are done: `docs/DEPLOYMENT.md` added, lint/build pass cleanly, and `supabase/migrations/20261017000004_tighten_rls.sql` fixes RLS issues 1–2 in section 10 (plus a related hole: students could insert `generated_documents` rows pointing at any storage path). Development branch: `claude/awesome-euler-jg6t9u`.

Read this first. It covers what we are building and why, everything built so far, the exact technical design, deployment status, and known issues found by reading the code. Also read `AGENTS.md` (Next.js version warning: check `node_modules/next/dist/docs/` before writing code).

- Owner: Ravi (GitHub: `mrravimalhotra`)
- Repo: `mrravimalhotra/studysprint` (public; product renamed to Syllabi on 2026-10-17 — the repo may be renamed to match)
- Working branch: `claude/app-generation-markdown-7bcyyt` (currently the repo's only branch)
- Code size: about 4,150 lines of TS/TSX plus 3 SQL migrations. HEAD at time of writing: `201f90a` "Retry once on transient network failures to the Gemini API" (17 commits).

---

## 1. What we are building

> **Full review (2026-10-17):** a developer-style review fixed security (open redirect, URL-text messages, key in URL, validation), reliability (unfinished uploads excluded from search, Gemini retries, blocked/truncated answers, 300 s answer routes, 8 images per upload request, JSON API errors) and added answer history with on-demand PDFs, forgot/reset password, account page with delete-account, renaming, and Google Search Suggestions display. Migration `20261017000008_answers_history_and_review_fixes.sql`. Details: `docs/app-review.md` section H.
>
> **Private testing (2026-10-17):** until the owner finishes testing, the app is limited to one admin tester. While `OPEN_SIGNUPS` is not `true`, only `ADMIN_EMAIL` can sign up and the access gate (`src/lib/supabase/middleware.ts`, switch in `src/lib/access.ts`) admits only admin accounts. To open to parents and tutors: set `OPEN_SIGNUPS=true` in Vercel and redeploy.
>
> **Bring your own book (2026-10-17):** the admin-curated shared library is retired. Each parent/tutor uploads their own child's/student's books under **My books** (`/dashboard/library`, APIs `/api/library`), with an ownership confirmation; books are private to the uploader and searched via `match_owner_chunks` (migration `20261017000006_private_libraries.sql`). Reading/indexing counts against the uploader's quota. The admin now only approves accounts, sets quotas and LLM settings. Schools/grades/subjects tables remain in the DB, unused. Sections 5–7 below still describe the old shared-library design in places.
>
> **Repositioned 2026-10-17:** accounts are for **adults only — parents and tutors** — who use Syllabi to prepare study material for their children/students. Students do not log in. Signup requires an 18+ confirmation and a parent/tutor choice (migration `20261017000005_adult_accounts.sql`); parents/tutors pick any grade of their assigned school and any assigned subject per request. Reason: the Gemini API terms forbid apps "likely to be accessed by individuals under the age of 18" (see `docs/app-review.md`, F1). The `students` table name and `role = 'student'` value were kept; each row is an adult account.

Syllabi is a cloud-native, globally accessible web app that acts as an intelligent study companion for school students. It turns curriculum materials into personalized study resources.

An admin-curated knowledge base (RAG) holds scanned and digital pages of textbooks, exercise books and past sample papers, each tagged by **School, Grade, Subject**. Students use it to:

1. Generate step-by-step solutions to homework exercises
2. Create concise, high-yield exam revision notes
3. Produce custom sample papers for practice
4. Run ad-hoc queries with free-text prompts

## 2. Why (as stated by the owner)

- Ground answers in what students are actually taught (their own school's materials), not generic internet content.
- Keep running cost as low as possible: free tiers or pay-per-use everywhere, plus a hard per-student token quota.
- The owner already has Google (Gemini) API access, so the student-facing LLM runs on Google, not Claude.
- All code is written through Claude Code (no other dev tooling).

Not specified by the owner (ask if it matters): target schools/customers, monetization, expected number of students.

## 3. Functional requirements (FRD)

1. **RAG first, always.** The knowledge base is the mandatory first source. Public internet info only if (a) the student explicitly asks for research, (b) outside knowledge is fundamentally required, or (c) the RAG content needs supplementing.
2. **PDF export** for all outputs (solutions, notes, sample papers, ad-hoc responses).
3. **Student profiles:** one unique profile per student.
4. **Admin tools:** grant/revoke access; configure and manage student profiles.
5. **Token quota** per student, to cap cost.
6. **Cloud-native:** highly available, scalable, accessible worldwide.

---

## 4. How the project got here (work done so far)

1. The FRD above was turned into a **low-cost blueprint**: serverless and free tiers everywhere; one Postgres (Supabase + pgvector) serving as both relational store and vector store; no separate OCR vendor (vision model reads scanned pages); self-hosted PDF rendering.
2. **Runtime LLM decision:** the owner has Google API access, so students' generation runs on Gemini behind a provider-agnostic abstraction. Provider and model are admin-configurable per task type from the database, with Anthropic and OpenAI adapters as optional fallbacks. Claude is a build-time tool only.
3. **File storage decision:** moved from Supabase Storage to **Cloudflare R2** (10 GB free, zero egress fees) because every uploaded page image is kept and re-served whenever a generation cites it.
4. An earlier Claude Code session built the app (auth, admin panel, ingestion, RAG, 4 generation routes, quota, PDF export, R2 storage). Later commits added PDF upload support, per-page source type, page images in RAG results, R2 migration, an architecture doc (`docs/architecture.html`), and a retry on transient Gemini network failures.
5. **Supabase key naming:** Supabase now issues `sb_publishable_...` (replaces anon) and `sb_secret_...` (replaces service_role). Legacy keys are being deprecated by end of 2026; new projects do not get legacy keys. The code still uses the old env var names; the new key values work in them.
6. **Deployment:** not done yet. The owner's Vercel account (Hobby plan) only has an unrelated project (`invento`). Syllabi has not been imported.
7. **Billing note:** the owner has a $100 "cloud session credit" that only applies to Claude Code cloud sessions, not to regular chats or Projects. That is why work is moving to this cloud session. Preferred model for routine work: Sonnet (stretches the credit); use Opus only for hard problems.

---

## 5. Architecture

```
Browser (Next.js App Router pages)
   │  login/signup, student dashboard, admin console
   ▼
src/proxy.ts → lib/supabase/middleware.ts   (session refresh, auth redirect, active/admin gate)
   ▼
Route handlers (src/app/api/*)  ──► Supabase Postgres (+pgvector)   [service-role client for server work]
   │                         ├──► Gemini API (completion, vision, embeddings; optional Anthropic/OpenAI)
   │                         └──► Cloudflare R2 (S3 API: source page images, generated PDFs)
```

Generation flow (all four routes share one pipeline):

```
POST /api/generate/{solution|notes|sample-paper|ad-hoc}
 → handler.ts: auth + active check, parse {prompt, optional admin scope override}
 → pipeline.ts: checkQuota() → resolve scope (student's school/grade/subject_ids[0], or admin override)
 → retrieve.ts: embed(query) → rpc match_chunks (taxonomy-filtered cosine search, top 8)
 → loadSourceImages(): download up to 4 unique page images from R2
 → generateCompletion(): system prompt (RAG-first) + context + images; search grounding enabled only if coverageLow
 → recordTokenUsage() → token_usage row
 → render PDF (@react-pdf/renderer), upload to R2, insert generated_documents row
 → JSON response: text, sources (with signed image URLs), usedSearchGrounding, 1-hour signed downloadUrl
```

Ingestion flow (admin only, `POST /api/admin/documents`):

```
Browser: PDF → pdfjs rasterizes each page to JPEG (scale 1.5, q0.82); images → downscaled to max 1800px JPEG
 → pages split into batches under a base64 cap (MAX_BATCH_BASE64_CHARS = 5 MB), sent sequentially
 → server ingestDocument(): per page: upload image to R2 (sources/{docId}/page-{n}.jpg)
      → Gemini vision transcription (task ocr_extraction) → chunkPageText (≤1500 chars, heading-aware)
      → embed each chunk (768-dim) → insert into chunks with taxonomy tags + image_path
 → document status processing → ready (or failed). Max 30 pages per request; maxDuration = 300s.
```

---

## 6. Data model (supabase/migrations)

Run in order: `20261017000001_init.sql`, `20261017000002_chunk_images.sql`, `20261017000003_flash_tier_defaults.sql`. Requires extensions `vector` and `pgcrypto` (0001 creates them).

| Table | Key columns |
|---|---|
| `schools`, `grades`, `subjects` | grades and subjects belong to a school (`school_id`), unique per (school, name) |
| `students` | `id` = `auth.users.id`; `role` student/admin; `school_id`, `grade_id`, `subject_ids uuid[]`; `active` bool; `token_quota` int (default 200,000 per calendar month) |
| `llm_settings` | one row per `task_type` (ocr_extraction, embedding, solution, notes, sample_paper, ad_hoc, coverage_check): `provider`, `model` |
| `documents` | title, school/grade/subject, `source_type` (textbook/exercise/past_paper/notes), `storage_path` (first page image), `status` (processing/ready/failed) |
| `chunks` | document + taxonomy copies, `page_number`, `section_label`, `content`, `embedding vector(768)`, `image_path` (added in 0002) |
| `token_usage` | student, task, provider, model, input/output/total tokens, created_at |
| `generated_documents` | student, task_type, title, R2 `storage_path` |

Functions: `match_chunks(query_embedding, school, grade, subject, count)` (filters by taxonomy then ranks by cosine similarity; returns image_path since 0002), `student_monthly_usage(student_id)`, `is_admin()` (security definer), `set_updated_at()` trigger on students. IVFFlat index on `chunks.embedding` (lists = 100). RLS is enabled on all tables.

Default model routing (after 0003): ocr, ad_hoc, coverage_check → `gemini-flash-lite-latest`; solution, notes, sample_paper → `gemini-flash-latest`; embedding → `gemini-embedding-001` truncated to 768 dims. Flash tier is the default because Pro-tier Gemini needs a billing-enabled Google Cloud project; switching a task to Pro is a config change in `/admin/llm-settings`.

Note: some SQL comments in 0001 are stale (mention Supabase Storage and text-embedding-004). Storage is R2 and embeddings are `gemini-embedding-001`.

---

## 7. Code map (`src/`)

| Area | Files |
|---|---|
| Access control | `proxy.ts`, `lib/supabase/middleware.ts` (public paths: /login, /signup, /auth/callback, /pending; inactive students → /pending; /admin requires role admin), `lib/auth.ts` (`getCurrentStudent`, `requireAdmin`), `lib/actions/auth.ts` (signIn, signUp, signOut) |
| Supabase clients | `lib/supabase/{client,server,admin}.ts` (admin = service-role, server only) |
| LLM layer | `lib/llm/index.ts` (`generateCompletion`, `embed`), `config.ts` (reads `llm_settings`, 30 s cache, invalidated on admin save), `types.ts` (normalized request/result/usage), `usage.ts`, `retry.ts` (one retry on transport errors), `assert-header-safe.ts`, `providers/{google,anthropic,openai}.ts` |
| Generation | `lib/generation/{pipeline,handler,prompts}.ts`; 4 thin routes under `app/api/generate/*` |
| RAG | `lib/rag/retrieve.ts` (MATCH_COUNT 8, COVERAGE_THRESHOLD 0.55, MAX_SOURCE_IMAGES 4) |
| Ingestion | `lib/ingestion/{ingest,chunk,extract}.ts`, client helpers `lib/pdf-to-images.ts`, `lib/downscale-image.ts`; `public/pdf.worker.min.mjs` is a copy from `node_modules/pdfjs-dist` (re-copy after upgrading pdfjs-dist) |
| Storage | `lib/storage.ts` (R2 via AWS SDK S3 client: uploadPdf, uploadSourceFile, downloadFile, getSignedUrl with 1 h TTL) |
| PDF | `lib/pdf/render.tsx` (A4, title, simple markdown rendering: #, ##, bullets, **bold**; sources list with embedded page images) |
| Quota | `lib/quota.ts` (`checkQuota`, `QuotaExceededError` → HTTP 429) |
| Admin UI/API | pages: `/admin` (counts), `/admin/students`, `/admin/taxonomy`, `/admin/documents`, `/admin/llm-settings`; APIs: `/api/admin/{students,taxonomy,documents,llm-settings}` |
| Student UI/API | `/dashboard` (4 generation tabs), `/dashboard/documents` (past PDFs), `/api/me`, `/api/documents`, `/api/documents/[id]/download` |

Stack: Next.js 16.3.2, React 19.2.8, Tailwind 4, TypeScript 5, zod 4, `@supabase/ssr` and `supabase-js`, `@google/generative-ai`, `@anthropic-ai/sdk`, `openai`, `@aws-sdk/client-s3` + presigner, `@react-pdf/renderer`, `pdfjs-dist`.

Behavior details worth knowing:
- Signup creates the Auth user, then inserts a `students` row with `active = false` using the service-role client; an admin must activate the student before they can use the app.
- Embeddings always use Google, regardless of the configured completion provider (pgvector column is fixed at 768 dims).
- Admins can generate for any school/grade/subject via an override; students are pinned to their own profile.
- Search grounding (Google Search tool) turns on automatically only when the best RAG match scores below 0.55 (or no matches).

---

## 8. Configuration

Environment variables (`.env.example`):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | legacy name; put the new `sb_publishable_...` value |
| `SUPABASE_SERVICE_ROLE_KEY` | legacy name; put the new `sb_secret_...` value (server only) |
| `GOOGLE_API_KEY` | required |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | optional fallbacks |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | bucket defaults to `syllabi` |

Optional cleanup: rename the Supabase env vars in code to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (used in `lib/supabase/{middleware,client,server,admin}.ts`), keeping Vercel in sync.

Supabase Auth settings to check: Site URL and Redirect URLs must include the Vercel domain (and `/auth/callback`); decide whether email confirmation is on (the callback route handles the confirmation redirect).

First admin bootstrap (no UI for this): sign up through the app, then in the Supabase SQL editor run:
`update students set role = 'admin', active = true where email = '<owner email>';`

---

## 9. Deployment status and checklist

Not deployed. Unknown and to verify: whether the Supabase project exists, migrations applied, pgvector enabled, R2 bucket and token created.

1. Supabase: create or confirm project; run the 3 migrations in order; confirm Auth URL settings.
2. Cloudflare R2: create bucket `syllabi`; create an API token with object read/write; note account ID.
3. Vercel (Hobby plan, non-commercial use only): Create New → Project → import `mrravimalhotra/studysprint`; add all env vars before the first deploy.
4. Local sanity check in the session: `npm ci`, `npm run lint`, `npm run build`.
5. Bootstrap the first admin (SQL above).
6. Smoke test: signup → admin activates the student → admin creates school/grade/subject → upload a few pages → generate a solution → download the PDF → confirm quota usage increments.

---

## 10. Known issues and risks (found by reading the code; verify before fixing)

Security (fix before real students use it):
1. **Privilege escalation via RLS (high).** `students_update_own` lets any signed-in user update their own row with no column restriction. Since the publishable key is public, a student could call the Supabase REST API directly and set `role = 'admin'`, `active = true`, or a huge `token_quota`. No browser code writes `students` directly (all writes go through service-role routes), so the fix is to drop the non-admin update policy (or restrict it to harmless columns via a trigger or column privileges). Also tighten `students_insert_admin` the same way.
2. **Knowledge base readable by any authenticated user, including inactive ones.** The select policies on `documents`, `chunks`, `llm_settings` only require `auth.role() = 'authenticated'`. A student who is pending or revoked still has a valid login and could query `chunks` directly through the REST API, bypassing the app's school/grade/subject scoping. Add an `is_active_student()` check, or restrict reads to admins (the server uses the service role for retrieval anyway).

Functional gaps against the FRD:
3. **Explicit research request is not implemented.** Search grounding only triggers when RAG similarity is below 0.55. There is no way for a student to say "research this" (FRD item 1a), and `coverage_check` exists in `llm_settings` and the admin UI but is not used in code.
4. **Students can only generate for their first subject** (`subject_ids[0]`); there is no subject picker for students (only for admins).
5. **Quota undercounts.** Only completion usage is recorded. The query embedding in retrieval and ingestion OCR/embedding calls are not written to `token_usage`. Embedding usage is also only approximated (length/4). The quota check happens before the call, so concurrent requests can overshoot.

Deployment risks:
6. **Upload size vs Vercel's request body limit.** Admin uploads batch up to 5 MB of base64 per request (`MAX_BATCH_BASE64_CHARS`), but Vercel serverless functions have historically limited request bodies to about 4.5 MB. Verify against current Vercel docs; if confirmed, lower the cap to about 3 MB or upload images straight to R2 with presigned URLs.
7. IVFFlat index was created on an empty table with `lists = 100`, which gives poor recall until rebuilt after data is loaded. Consider `REINDEX` after ingestion, or switch to an HNSW index.
8. The repo is public: never commit real keys. `.env*` handling should be checked in `.gitignore` (the standard Next.js ignore is present).

---

## 11. Working agreements

- **Never ask the owner to paste secrets into chat.** Keys go straight into Vercel or a local gitignored `.env`. Environment variables in a cloud environment are readable by anyone using it, so don't put production keys there.
- Owner preference: end each session with a concrete next action so plans don't stall.
- **Before every push to `main`:** follow `docs/release-checklist.md` part 1 (tsc, lint, build, `npm run test:db`, `npm audit --omit=dev`). Record decisions in `docs/decisions.md`.
- **Setup instructions: one step at a time.** Give one small step, wait for the owner to confirm, then give the next. Never mix instructions for different products (Supabase, Cloudflare, Vercel, GitHub, Google) in the same message.
- Keep answers short and in English. The owner has 21 years in data warehousing/BI and agile leadership but is learning cloud and AI tooling, so explain deployment steps plainly.
- Be cost-conscious: prefer free tiers, avoid new paid services, use the cheaper model for routine work.

## 12. Recommended next steps (in order)

1. Commit `docs/DEPLOYMENT.md` (condensed from sections 8 and 9) and this file as `docs/HANDOFF.md`.
2. Run `npm ci`, `npm run lint`, `npm run build`; fix failures.
3. Fix the two RLS security issues (section 10, items 1 and 2) with a new migration `20261017000004_tighten_rls.sql`.
4. Guide the owner through Supabase, R2 and Vercel setup (section 9) and debug the first build.
5. Address the Vercel body-size risk (item 6) before the first large upload.
6. Then close FRD gaps: explicit research option (item 3), student subject picker (item 4), full usage accounting (item 5).
