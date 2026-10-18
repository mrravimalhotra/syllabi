# Handoff for the next coding session

Read this first, then `docs/PROGRESS.md` (what exists, in plain language),
`docs/KNOWN-ISSUES.md` (open problems and pending work, by severity),
`docs/decisions.md` (why things are the way they are, newest at the bottom),
and `AGENTS.md` (this Next.js version differs from what you know: read
`node_modules/next/dist/docs/` before writing Next.js code). `docs/HANDOFF.md`
is the original long handoff; its sections 1–9 (goals, FRD, architecture)
are still useful, its "next steps" are done.

## The owner and how to work with them

- Owner: Ravi (GitHub `mrravimalhotra`), parent/tutor, 21 years in data warehousing and BI, new to cloud and AI tooling. Keep answers short, plain and in English.
- **Setup instructions one step at a time, one product at a time** (Vercel, Supabase, Cloudflare, Google, Groq...). Give a step, wait for "done", then the next.
- **Never ask for secrets in chat.** Keys go into Vercel → Settings → Environment Variables (or a gitignored `.env`).
- The owner tests on an iPhone, using Syllabi added to the Home Screen (standalone mode: no back button, no print dialog, pages pause in the background).
- End each reply with one concrete next step for the owner.
- Prefer free tiers. Practice features are English only (owner's decision); Generate supports content in English, Hindi, Marathi and French.
- Sample school material is in gitignored `test-material/` and must never be committed. The repo is public: never commit keys or personal documents.

## Git and release routine

- Work on branch `claude/awesome-euler-jg6t9u`. After each finished change, also fast-forward main: `git push origin claude/awesome-euler-jg6t9u:main`. A push to main deploys Vercel and applies new Supabase migrations automatically.
- Stage files by name (never `git add -A`). No pull requests unless asked.
- Commit messages: a plain summary line, a short body, then the attribution lines the session's harness asks for. Don't put AI model names in commits, code or docs.
- Before every push, all must pass: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:db`, `npm run test:practice`, `npm run test:llm`, `npm run test:api`, `npm run test:e2e`, `npm run check:unused`, `npm audit --omit=dev`, `npm run scenarios`.
- Record each design decision as a row in `docs/decisions.md`, and add live test rows (T-62 onward) to `docs/release-checklist.md`.

## Stack and where things live

- Next.js 16 App Router (`src/proxy.ts` is the middleware entry; session and access rules in `src/lib/supabase/middleware.ts`, public paths include `/api/jobs`). React 19 with the React compiler lint rules (no impure calls such as `Date.now()` during render, no mutating values React tracks). Tailwind 4 with brand tokens in `src/app/globals.css`.
- UI kit: `src/components/ui.tsx` (button variants, `card`, `input`, `Field`, `Alert`, `Badge`, `Spinner`, `PageHeader`...), icons in `src/components/icons.tsx`. Don't combine conflicting Tailwind classes; add a variant instead.
- Supabase: migrations `supabase/migrations/2026101700000{1..16}_*.sql`, security tests `supabase/tests/10_security.test.sql` (run by `npm run test:db` on a local Postgres).
- AI: `src/lib/llm/` — `index.ts` (routes each task to the provider/model in the `llm_settings` table, then falls back to Groq → OpenRouter → Mistral when their keys are set), `providers/google.ts` (Gemini; switches between `gemini-flash-latest` and `gemini-flash-lite-latest` on daily-limit or overload), `providers/openai.ts` (one adapter for OpenAI, Groq, OpenRouter, Mistral by base URL), `retry.ts`, `config.ts`. Embeddings stay on Gemini (`gemini-embedding-001`, 768 numbers; the database column is fixed at 768).
- Errors shown to users: `src/lib/errors.ts` (`UserError`, `BlockedReplyError`, `DAILY_LIMIT`, `userMessage`).
- Book upload and reading: browser `src/app/dashboard/library/page.tsx` creates the book (`POST /api/library` without pages), sends pages one scanned page per request two at a time (`POST /api/library/[id]/pages`), which stores them in R2 and queues them in `page_jobs`. `src/lib/ingestion/jobs.ts` reads queued pages after the reply (`after()`), at most 2 at once app-wide (`claim_page_job`), hands over to a fresh run before 300 s, and marks the book ready when all pages are done. A pg_cron + pg_net timer (migration 14) calls `/api/jobs/pages` every minute with a token generated in the database (`job_runner`). Page text: `src/lib/ingestion/ingest.ts` (`ingestPage`), `extract.ts` (page reading prompt, second-model fallback, partial text), `chunk.ts`.
- Generation: `src/lib/generation/` (`handler.ts`, `pipeline.ts`, `prompts.ts`, `level.ts`, `language.ts`, reuse cache), retrieval `src/lib/rag/`, checks `src/lib/checks/` (`arithmetic.ts` with mathjs, `rules.ts`).
- Worked examples: `src/lib/worked/` (engines `division.ts`, `lcm-hcf.ts`, `column.ts`, `multiplication.ts`, `fraction.ts`, `units.ts`; `detect.ts` finds calculations and decides when a question is only a calculation; `say.ts` holds all narration in English/Hindi/Marathi) and `src/components/worked/WorkedExampleView.tsx` (chalkboard player).
- Practice: `src/lib/practice/` (seeded generator `random.ts`, exact numbers `numbers.ts`, ordering quiz `order.ts`), `src/components/practice/` (`TutorialsCard.tsx`, `OrderQuiz.tsx`, `WhyPanel.tsx`, `Confetti.tsx`, `sounds.ts`), page `src/app/dashboard/practice/page.tsx`, worksheet PDF `src/app/api/practice/worksheet/route.ts`.
- PDFs: `src/lib/pdf/render.tsx` (react-pdf, Noto fonts; "## Answer Key" starts a new page; U+2028 is a line break inside a list item). Buttons: `src/components/PdfButton.tsx` and `PrintButton.tsx` (share sheet in the iPhone home-screen app).
- Admin: `src/app/admin/` (users, AI settings, Health page `src/app/api/admin/health/route.ts`).

## Environment variables (set in Vercel, never in Git)

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (= `syllabi`), `ADMIN_EMAIL`, `OPEN_SIGNUPS=false`.
Optional backups: `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY` (and `*_MODEL` overrides). See `.env.example` and `docs/DEPLOYMENT.md`.

## Testing in a cloud container (no live keys here)

- No access to Vercel logs or the live database from the container; diagnose live problems from the owner's screenshots and the admin Health page.
- UI previews: temporarily add `if (process.env.UI_PREVIEW) return NextResponse.next({ request });` as the first line of `updateSession` in `src/lib/supabase/middleware.ts` (back the file up first), run `UI_PREVIEW=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next dev -p 3123`, and drive it with playwright-core (Chromium at `/opt/pw-browsers/chromium`), mocking `/api/*` routes. Restore the middleware and stop the server before committing (check `grep -c UI_PREVIEW` is 0).
- Small unit checks: bundle a `.ts` file with `npx esbuild file.ts --bundle --platform=node --format=esm --alias:@=./src` and run it with node.

## Open items, in order

1. **Wait for the owner's live checks** listed at the end of `docs/PROGRESS.md`. If Health says the background timer isn't set up, the Supabase project needs the `pg_cron` and `pg_net` extensions enabled (Dashboard → Database → Extensions), then re-run migration 14's timer block.
2. **Backup AI keys:** the owner was at step 1 for Groq (create a key at https://console.groq.com/keys). Next step: Vercel → syllabi → Settings → Environment Variables → add `GROQ_API_KEY` → redeploy → Admin → Health shows "Backup AI: groq" green. Then OpenRouter, then Mistral, one at a time.
3. **Known loose ends:** the owner's two "History Unit 1 Bhakti Movement" books are the two halves of one upload made before the one-book fix (fine to keep). The old R2 bucket `studysprint` holds orphan files and can be deleted. There is no vector index on `chunks` (migration 6 dropped it); consider HNSW once libraries are large. Set `APP_URL` in Vercel so a preview deployment can't overwrite the address the background timer calls.
4. **Possible next features** (ask the owner first): practice history (`practice_sessions` table), more practice exercises using the worked-example engines, child profiles.


## Optional environment variables added later

- `TTS_VOICE` (default `Leda`; other female Gemini voices: Aoede, Laomedeia, Sulafat, Zephyr) and `TTS_MODEL` (default `gemini-2.5-flash-preview-tts`): the study-pack read-aloud voice. Gemini speech has a small free daily allowance; each text is made once and stored in R2 under `speech/`.
- `NEXT_PUBLIC_SITE_URL` and `APP_URL`: fixed addresses for password-reset links and the background timer.
