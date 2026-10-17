# Syllabi

A RAG-powered study assistant for **parents and tutors** (adults only) to
prepare study material for school students: step-by-step solutions, revision
notes, sample papers, and ad-hoc Q&A — grounded first in each school's own
curriculum material, exportable to PDF. Students do not get accounts; the
adult reviews and hands over the material. Per-account token quotas and a
provider-agnostic LLM layer (defaults to Google Gemini, swappable to
Anthropic/OpenAI per task type from the admin panel, no redeploy needed).

Built per the low-cost blueprint: Next.js on Vercel, Supabase for Auth and
the Postgres/pgvector database, Cloudflare R2 for file storage, and Gemini's
native vision for OCR instead of a dedicated OCR vendor.

For a component-by-component walkthrough with diagrams and a full file-by-file
reference, see [`docs/architecture.html`](docs/architecture.html) (open it in
a browser).

## Stack

- **Frontend/Backend**: Next.js 16 (App Router), TypeScript, Tailwind CSS — deployed on Vercel
- **Auth + DB**: Supabase (Postgres + `pgvector`, bundled Auth)
- **File storage**: Cloudflare R2 (S3-compatible, 10GB free, zero egress fees)
- **LLM**: Google Gemini by default via `src/lib/llm/`, with Anthropic/OpenAI adapters ready to swap in per task type
- **PDF export**: `@react-pdf/renderer`, rendered server-side, stored in R2, delivered via signed URLs

## Project layout

```
src/
  app/
    (public)      login, signup, pending-approval
    dashboard/     student UI — generate content, view/download past documents
    admin/         admin UI — students, taxonomy, knowledge base uploads, LLM routing
    api/
      generate/    solution | notes | sample-paper | ad-hoc  (shared pipeline, §lib/generation)
      admin/       students, taxonomy, documents (ingestion), llm-settings
      documents/   student's own generated-document listing + signed download
      me/          current student profile + quota
  lib/
    llm/           generateCompletion() + embed() — the provider abstraction layer
    rag/           retrieveContext() — the shared vector-search core
    generation/    system prompts + the shared quota→retrieve→generate→record pipeline
    ingestion/     vision text extraction → chunking → embedding → pgvector insert
    pdf/           shared PDF renderer
    supabase/      browser/server/admin Supabase clients + middleware session refresh
    quota.ts       monthly token-quota check
    storage.ts     Cloudflare R2 upload/download + signed URL helpers (S3-compatible SDK)
supabase/migrations/   schema, RLS policies, match_chunks() / student_monthly_usage() RPCs
```

## Setup

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free tier is enough for a pilot).
2. In the SQL editor, run `supabase/migrations/20261017000001_init.sql`, then
   `20261017000002_chunk_images.sql`, `20261017000003_flash_tier_defaults.sql` and
   `20261017000004_tighten_rls.sql`, in order. This enables `pgvector`, creates every
   table, the `match_chunks`/`student_monthly_usage` RPCs, and RLS policies.
3. In Authentication settings, disable "Confirm email" for faster pilot onboarding, or
   configure your SMTP provider if you want email confirmation.

### 2. Create a Cloudflare R2 bucket

1. Sign up at [Cloudflare](https://dash.cloudflare.com) (no card required for R2's free tier) and open **R2** in the sidebar.
2. Create a bucket — the name you pick goes in `R2_BUCKET_NAME`. Keep it private; the app never links to it directly, only via time-limited signed URLs.
3. Go to **Manage API Tokens** → create a token with **Object Read & Write** permission scoped to that bucket. This gives you `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
4. Your `R2_ACCOUNT_ID` is shown on the R2 overview page (also visible in the bucket's S3 API URL: `https://<account-id>.r2.cloudflarestorage.com`).

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — same page (**server-only secret, never expose to the client**)
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` — from step 2
- `GOOGLE_API_KEY` — your existing Google AI Studio / Gemini API key (default runtime provider)
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — optional, only needed if you switch a task type to that provider from the admin panel

### 4. Install and run

```bash
npm install
npm run dev
```

### 5. Bootstrap the first admin

Sign up through `/signup` — this creates your account but leaves it inactive
(`students.active = false`) so a stranger can't self-grant access. For the very
first account, promote yourself directly in the Supabase SQL editor:

```sql
update students set role = 'admin', active = true where email = 'you@example.com';
```

After that, use `/admin/students` to grant/revoke access and set quotas for
everyone else — no more SQL needed.

### 6. Populate the knowledge base

In `/admin/taxonomy`, add at least one school, grade, and subject. Then in
`/admin/documents`, upload scanned/photographed pages (JPG/PNG) or a PDF —
PDFs are rasterized into per-page images client-side (`src/lib/pdf-to-images.ts`,
via `pdfjs-dist`) before upload, so the server only ever handles page images.
If a batch mixes content types (e.g. a chapter followed by its exercises),
set the type per page in the thumbnail grid — pages are grouped by contiguous
type and ingested as separate documents automatically. Each page is
transcribed via the LLM's native vision input (`ocr_extraction` task type,
Gemini Flash by default), chunked, embedded, and indexed into `pgvector`.
Students only retrieve chunks matching their own school/grade/subject.

Every page's original image is also uploaded to R2 (`chunks.image_path`,
via `src/lib/storage.ts`) and linked to its chunks — not just the OCR'd text.
This matters for anatomy diagrams, maps, and other figures where the text
transcription alone loses the actual content: when a chunk with an image is
retrieved, `runGeneration()` (`src/lib/generation/pipeline.ts`) passes that
image into the LLM call too (so the model can reference it directly, e.g. for
labeling questions), embeds it in the exported PDF, and shows it inline in the
student's on-screen result. No admin tagging is required — every uploaded page
is treated this way automatically, which is why file storage volume scales
with pages uploaded, not just text volume — the reason R2 (10GB free, no
egress fees) is the storage layer rather than Supabase's smaller free tier.

## Deploying

Push to GitHub and import the repo into Vercel. Set the same environment
variables there. The ingestion route (`/api/admin/documents`) sets
`maxDuration = 300` for multi-page vision extraction — this requires a Vercel
plan that allows >60s serverless functions (Pro or higher) if you upload large
documents; small uploads work fine on Hobby's default limit.

## Notes on the LLM abstraction layer

Every generation call in the app goes through `generateCompletion()`
(`src/lib/llm/index.ts`), which looks up the provider + model for that task
type from the `llm_settings` table (editable at `/admin/llm-settings`) and
routes to the matching adapter (`providers/google.ts`, `anthropic.ts`,
`openai.ts`). Every adapter returns the same normalized `{ text, usage }`
shape, so quota tracking in `token_usage` works identically regardless of
which vendor actually served a given request — switching providers for any
task type is a database write, not a code change or redeploy.

## Notes on storage

`src/lib/storage.ts` is the only file that knows about R2 — it wraps the
S3-compatible AWS SDK (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
behind four functions (`uploadPdf`, `uploadSourceFile`, `downloadFile`,
`getSignedUrl`) that the rest of the app calls without knowing which vendor is
behind them. Supabase still handles Auth and the Postgres/pgvector database —
only file storage moved, since that's the piece whose volume scales with
pages uploaded rather than with student count.
