# Known issues and pending work (as of 2026-10-17)

Severity: **High** = can lose data or stop a core feature; **Medium** = wrong or
confusing for users, or a risk at real use; **Low** = polish or housekeeping.
"Unverified" means built and tested locally but not yet confirmed on the live
site. See `docs/NEXT-SESSION.md` for the code map and `docs/PROGRESS.md` for
what works.

## 1. Waiting for live confirmation

| # | Item | Severity | What to check |
|---|---|---|---|
| 1.1 | Once-a-minute background reading timer (pg_cron + pg_net, migration 14) | High | Admin → Health → "Background page reading". The migration skips the timer if Supabase refuses the extensions; then enable `pg_cron` and `pg_net` (Supabase → Database → Extensions) and re-run the timer block. Without it, reading still runs after each upload and hands over to fresh runs, but pages waiting on the AI's daily allowance won't resume by themselves. |
| 1.2 | Reading pages with `gemini-flash-lite-latest` (migration 15) | Medium | Quality of page reading on scanned textbooks, especially Hindi/Marathi and maths. Switch back per task in Admin → AI settings if worse. |
| 1.3 | Backup AI services (Groq, NVIDIA, OpenRouter, Mistral) | Medium | Only tested with simulated responses. Add one key at a time in Vercel, then Admin → Health. Default model names (`openai/gpt-oss-120b`, `openrouter/free`, `mistral-small-latest`) may change; override with `GROQ_MODEL` etc. |
| 1.4 | Print and PDF via the iPhone share sheet (home-screen app) | Medium | T-59 in `docs/release-checklist.md`. iOS sometimes needs a second tap ("Tap to print"). |
| 1.5 | Maths tutorials card and ordering quiz | Low | T-47 to T-49, T-61. |

## 2. Known limitations (by design for now)

| # | Item | Severity | Notes |
|---|---|---|---|
| 2.1 | Free-tier AI may use requests for training | Medium | Applies to Gemini's free tier and most free backups. Children's books and questions are sent to the AI. Enabling Gemini billing (paid tier) avoids this; check before real use beyond testing. |
| 2.2 | Free daily allowances | Medium | A heavy day of page reading can still use up both Gemini models; answers then go to backups (if keys are set) or show "allowance used up, resets around 12:30–1:30 pm India time". The reset time used for waiting pages is 08:05 UTC (approximate). |
| 2.3 | Backups don't do everything Gemini does | Low | No web search; study packs (structured JSON) stay on Gemini only; Groq can't read images; the OpenAI-style adapter doesn't pass a max answer length, so very long answers may be cut by the service's default. |
| 2.4 | Worked examples cover only plain calculations | Low | Not handled: mixed units ("28 m 68 cm"), BODMAS expressions ("12 + 5 × 3"), three or more fractions, "3/4 of 20", numbers written in words. These go to the AI. |
| 2.5 | Hindi and Marathi narration wording | Low | Written without a native-speaker review (`src/lib/worked/say.ts`); French narration falls back to English. |
| 2.6 | Practice is English only, nothing is saved | Low | Owner's decision. Quiz scores are not stored; "Practise the ones I missed" can't be printed (it has no seed). |
| 2.7 | Duplicate check is by title only | Low | Uploading the same pages under a new title makes a second book. |
| 2.8 | The calculation checker is heuristic | Low | It recomputes lines with `=`; unusual layouts may be skipped or, rarely, flagged wrongly (list bullets were fixed). |
| 2.9 | Function time limit | Low | Long tasks assume Vercel's 300-second limit (fluid compute). If the project runs on the 60-second limit, page reading hands over more often and long answers may time out. |

## 3. Technical debt and risks

| # | Item | Severity | Notes |
|---|---|---|---|
| 3.1 | Vector index | Medium | `chunks` has no vector index (migration 6 dropped the IVFFlat one), so search scans each owner's rows. That is fine for a few books; add an HNSW index in a new migration once libraries are large. |
| 3.2 | Usage accounting misses question searches | Low | Page reading, indexing and answers are counted in `token_usage`, but the embedding made for each question search (`src/lib/rag/`) is not. |
| 3.3 | `job_runner.app_url` follows the last https upload | Low | An upload from a Vercel preview deployment would point the timer at the preview URL until the next production upload. Pin it to the production domain if previews get used. |
| 3.4 | Leftover code paths | Low | `POST /api/library` with pages (old single-request upload) and `PATCH /api/library/[id]` `{ ready: true }` are kept for older open tabs; remove after a while. |
| 3.5 | No explicit "research this" option | Low | Web search only runs when the books cover a question poorly; there is no way to ask for it (original requirement 1a). |
| 3.6 | Repository renamed on GitHub | Low | GitHub reports `mrravimalhotra/studysprint` moved to `mrravimalhotra/syllabi`. Update the git remote and check the Vercel and Supabase GitHub integrations point at the new name. |

## 4. Housekeeping for the owner

- The old R2 bucket `studysprint` holds orphan files and can be deleted.
- The two "History Unit 1 Bhakti Movement" books are the two halves of one upload made before the one-book fix; keep both or delete and upload again.
- Unfinished uploads from the early failures can be removed with "Delete N unfinished uploads" in My books.
- Sign-ups are closed (`OPEN_SIGNUPS=false`); before opening them, review quotas per account, the privacy note in 2.1, and the vector index in 3.1.

## 5. Pending features (not started; ask the owner first)

1. Practice history: a `practice_sessions` table, recent scores, and "practise what you got wrong last time".
2. More practice exercises built on the worked-example engines: compare with < and >, place value, times tables, conversions, simplifying fractions.
3. Child profiles, if several children share one account (class, board and history per child).
4. A "Research this" switch on Generate (see 3.5).

## Kindergarten (added later)

| # | Item | Severity | Notes |
|---|---|---|---|
| K.1 | Printable kindergarten worksheets | Low | Built as browser print pages (Practice → Kindergarten → Printable worksheets): word families and picture matching. They print with the browser's Print, so on an iPhone Home Screen app open Safari instead. Pictures are emoji, which look different on each phone and printer; a PDF version needs drawn pictures. |
| K.2 | Letter sounds (phonics) | Medium | Sounds follow common phonics practice (sounds not names; hold m s f n l r v z; keep b d g k p t quick; blend slowly, then faster) in `src/lib/kindergarten/phonics.ts`. A speech voice can only approximate a pure sound from a spelling ("buh" for b), so each account can record its own sounds (Record the sounds page, stored in R2 and private) and files in `public/sounds/<letter>.mp3` are a shared fallback (see `public/sounds/README.md`). Listen on a phone and record the unclear ones. The method comes from general phonics teaching practice, not from watching specific videos. |
| K.3 | Gemini speech free allowance | Medium | Every new word or phrase is made once and stored; a big first session may use the free allowance, then the phone's voice reads. |
| K.5 | The "sound" style asked of the speech voice, and the IPA table, are not yet checked on a real phone; the voice may still add a vowel | Medium | Use Record the sounds for any that sound wrong. |
| 1.2 | Supabase advisors still list: extensions `vector` and `pg_net` installed in `public`; `is_admin()` callable by signed-in users; tables `error_log`, `job_runner`, `page_jobs` have row security on with no policy; an unused index on `students`; leaked-password protection off | Low | All intentional or harmless: the extensions are in use (moving `vector` would break columns), `is_admin()` is needed by the row-security rules and only says whether the caller is an admin, and the three tables are server-only on purpose (no policy = no access for browsers). Leaked-password protection is a Supabase Auth setting (Authentication → Policies → Password security; may need a paid plan). |
| 1.3 | A shared guest login (user ID + one fixed password) is one account for everyone who knows it: they see each other's books and answers and share one monthly allowance. If Supabase refuses the stand-in address made for an ID-only guest (it can check that an email domain exists), the form says so; use the email option for that guest | Medium | Keep the allowance small and the end date short; change the password by making a new guest. |
| Q.1 | Code-quality backlog (nothing is broken). Done: every big screen and route was split into small parts, each with browser or route tests that pass on the old and new code (My books, Generate, Practice, Quiz, Study pack and its practice test, Kindergarten, Record sounds, Accounts and the guest form, Account, Documents, Worksheets, the health check, guest and generation routes, middleware); request checking moved to tested helpers; the maths, answer checks, question splitting and PDF blocks are guarded by 6,465 golden cases (`npm run test:golden`). A lint ratchet (`eslint.config.mjs`: complexity 22, function length 165, depth 4, parameters 7) stops new code getting worse. Still above the comfortable limits (complexity 15, 120 lines, 5 parameters) and left on purpose or for later: `DashboardPage` (133 lines, complexity 22), `useGeneration` (147), `LibraryPage` (149), `PracticePage` (130), `CvcGame` (156), `BlendGame` (127), `useSay` (161), `TutorialsCard` (148), `AnswerBlock` (126), five functions at complexity 16 (`createGuest`, `columnSubtraction`, `toResult`, a docx reader, one more), `tone`, `makeAndSaveAnswer` and `digitSteps` (6-7 parameters), and the narration methods in `worked/say.ts` (6-7 parameters each, once per language, which read better as they are) | Low | Do one at a time with its browser test green before and after, then lower the numbers in `eslint.config.mjs`. |
| K.4 | Hindi and Marathi letters, counting objects, number order, shapes and colours | Low | Planned next activities. |
