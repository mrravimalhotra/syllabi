# Decisions on record

What was decided, when, and why, so the same question isn't asked twice. Newest first. Parked items are at the end.

| Date | Decision | Why |
|---|---|---|
| 2026-10-17 | Owner's sample school material (Grade 7 Social Science papers, worksheets, an answer key) is used to teach the prompts Indian exam conventions (question types, marks-to-length, section pattern, model-answer style) and as test material. Nothing is "trained": Syllabi answers from uploads at question time. The files and their questions are not committed (the repo is public and they are the school's copyright) | Better-fitting answers and papers without redistributing school material |
| 2026-10-17 | Owner's textbook photos (Computer studies, "Introduction to HTML") used the same way: to improve page reading (headings, side boxes, figures, exact code) and code handling in answers, screen and PDF. Not committed | Phone photos of real chapters with code exposed gaps |
| 2026-10-17 | Word (.docx) uploads are read as text in the browser (pictures inside are skipped) | Schools send worksheets as Word files; text needs no AI page-reading, so it is cheaper |
| 2026-10-17 | Borrow the applicable parts of the Next.js + Supabase best-practices checklist; discard the inventory-specific parts (ledger, units/money, QC approvals, retests, numbering, Excel export, patch-file delivery) | See `app-review.md` section G |
| 2026-10-17 | Private testing: only `ADMIN_EMAIL` can sign up and only admins can use the app until `OPEN_SIGNUPS=true` | Owner tests every feature before others get in |
| 2026-10-17 | Bring your own book: each parent/tutor uploads their own copy, private to their account, with an ownership confirmation | Same model as uploading a PDF to Claude/Gemini; the operator no longer copies and distributes books |
| 2026-10-17 | Users are adults only (parents and tutors); students don't get accounts | Gemini API terms bar apps likely to be accessed by under-18s; also avoids children's-data consent (DPDP) |
| 2026-10-17 | Photos can be attached to a question (up to 3) | Matches how people use Claude/Gemini with homework photos |
| 2026-10-17 | Database changes are applied by the Supabase GitHub integration on push to `main` | No copy-pasting SQL; free plan supports production deploys (not preview branches) |
| 2026-10-17 | Supabase in South Asia (Mumbai); Vercel functions in `bom1` | Owner and users are in India; app and database must be close |
| 2026-10-17 | Product name: Syllabi (renamed from StudySprint) | Owner's choice |
| 2026-10-17 | Setup instructions are given one step at a time, one product per message | Owner preference |
| 2026-10-17 | Development uses BMAD v6 (installed); groundwork docs first to cut its cost | Owner preference |
| Before 2026-10 | Gemini (Flash tier) by default, provider switchable per task in the admin panel; Claude is a build-time tool | Owner has Google API access; free tier |
| Before 2026-10 | Cloudflare R2 for files | 10 GB free, no egress fees |

## Parked (decide later)

| Item | Why parked |
|---|---|
| Confirm with Google (or a lawyer) that an adults-only Syllabi is acceptable under the Gemini API age terms; Claude is the fallback | Needs an external answer |
| Terms of service with a takedown process; short legal check of the bring-your-own-book model | Needed before opening sign-ups |
| Automatic sign-out after inactivity | Low risk for a private, adults-only app; revisit at launch |
| Audit log of admin actions (grant/revoke, role, quota) | Only one admin during testing |
| Enforce the Content Security Policy (currently report-only) | Switch after a clean test pass |
| Pricing, first pilot customer, expected number of users | Product questions for the PRD |
| Make the GitHub repo private | Public repo exposes the code; Vercel Hobby supports private repos. Owner's call |
| Private evaluation set built from real worksheets and answer keys (C2) | Must be stored outside the public repo |
