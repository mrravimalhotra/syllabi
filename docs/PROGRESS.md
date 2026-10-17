# Syllabi: what has been built (as of 2026-10-17)

Syllabi is a private study helper for parents and tutors. You upload your
child's own books, worksheets and past papers ("bring your own book"), and
Syllabi answers questions, solves worksheets, writes notes, sample papers and
chapter study packs from those books. It works on phones, and everything can
be printed or saved as a PDF.

- Live: https://syllabi-study.vercel.app (private testing: only the admin account can use it)
- Code: GitHub `mrravimalhotra/studysprint` (GitHub says it moved to `mrravimalhotra/syllabi`; pushes still work)
- Hosting: Vercel (app), Supabase (database and sign-in, Mumbai), Cloudflare R2 (page images), Google Gemini (AI, free tier)

## What a parent can do today

| Area | What it does |
|---|---|
| **My books** | Upload photos, PDFs (up to 60 pages) or Word files. Large files are shrunk on the phone like WhatsApp. Pages are read in the background on the server, so the upload finishes even if the app is closed. Typed PDFs are read by code (no AI). Each page keeps its own type (textbook, exercise, past paper, notes) inside one book. Failed pages show the reason and can be tried again. |
| **Generate** | Step-by-step solutions, revision notes, sample papers with answer keys, quick answers ("Ask") and chapter study packs, all from the selected books. Answers can be in English, Hindi, Marathi or French, or follow the book. A repeated question reuses the saved answer. |
| **Checks by code** | Every calculation in an answer is recomputed exactly; sample-paper marks are added up; questions are checked for being answered. Problems show in a yellow box. |
| **Worked examples** | A question that is only a calculation (long division, LCM/HCF, column addition and subtraction, long multiplication, fractions, metric conversion) is solved by code on an animated chalkboard with read-aloud, in English, Hindi or Marathi. No AI, always exact. Calculations inside worksheets get a "See it worked out" link. |
| **Practice** | *Maths tutorials*: pick a method, type numbers or ask for an example, watch the chalkboard. *Put the numbers in order*: a quiz for whole numbers, decimals and fractions, levelled by the child's class, with "Why?" explanations, confetti, a score screen and a printable worksheet. English only. |
| **Study packs** | A whole chapter turned into a walkthrough, questions and a practice test with automatic marking of objective questions. |
| **Documents** | Every answer is saved and can be reopened, renamed, copied, printed or downloaded as a PDF. |
| **Account** | Name, child's class and board, answer language, monthly usage, password, delete account. |
| **Admin** | Users, AI model per task (Gemini, Groq, OpenRouter, Mistral, OpenAI, Anthropic), and a Health page that tests every live service. |

## Reliability work done after live testing

- **Uploads:** one book per upload (no duplicates), pages queued and read on the server two at a time, automatic retries, a once-a-minute database timer that restarts stalled reading, and resume after the AI's daily allowance resets.
- **AI limits:** reading pages uses the lighter Gemini model, every AI call falls back to the other Gemini model, then to free backups (Groq, OpenRouter, Mistral) when their keys are set. Errors say plainly when the daily allowance is used up.
- **iPhone home-screen app:** Print and PDF open the iPhone share sheet (Print, Save to Files, WhatsApp) instead of trapping the app on a PDF.
- **False warnings:** the calculation checker no longer mistakes list bullets for minus signs.

## Quality checks run before every release

`tsc`, `npm run lint`, `npm run build`, `npm run test:db` (45 database security checks), `npm run test:practice` (over a million generated quiz checks), `npm audit --omit=dev`, `npm run scenarios` (27 sample files, kept out of Git). Manual live checks: `docs/release-checklist.md` (T-1 to T-61).

## Still waiting on the owner (live checks)

1. Admin → Health: confirm "Reading book pages (AI)" and "Background page reading" (the once-a-minute timer) are green.
2. Groq key (step 1 given: create a key at console.groq.com), then add it in Vercel; later OpenRouter and Mistral, one at a time.
3. Print from the iPhone home-screen app via the share sheet (T-59).
4. Practice → Maths tutorials (T-61) and the ordering quiz (T-47 to T-49).
5. Upload a scanned chapter and close the app while it is read (T-54).

Known problems and pending work are listed in `docs/KNOWN-ISSUES.md`.

## Ideas not built yet

- Practice history: saved scores and "practise what you got wrong last time" (needs a `practice_sessions` table).
- More practice exercises built on the worked-example engines (compare with < and >, place value, times tables, conversions).
- Child profiles, if several children share one account.
