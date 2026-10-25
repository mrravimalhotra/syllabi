# Syllabi — Product Review & Standards Baseline

Input for BMAD planning (PRD, epics, stories). Written 2026-10-17 from a read of the code and a comparison with leading apps. Status: ✅ done · ⚠️ partial · ❌ missing.

## 1. Positioning

- **Users (decided 2026-10-17):** adults only — **parents and tutors** who prepare study material for their children/students. Students do not get accounts. Payers are tutors, coaching centres and parents (schools optional later).
- Not individual students: for one learner alone, Google NotebookLM is free and more polished.
- **Why Syllabi wins for that customer:**
  - Private "bring your own book" library: answers come from the student's actual books, kept private to the parent or tutor.
  - Material matched to the student's school, grade and subject.
  - Admin approves and revokes access.
  - Hard per-account cost cap.
  - Sample papers in the school's own past-paper style.
  - One parent or tutor can prepare for several students and grades.
  - Adult-supervised by design: the parent or tutor reviews AI material before the student sees it.
- **Focus:** Indian boards (CBSE/NCERT, ICSE, state boards), exam prep, mobile-first, English plus Hindi/regional languages.
- **Main risk:** Google ships a classroom NotebookLM. Mitigations are board-aligned content, past-paper exam prep, teacher/parent visibility, low cost, and getting real schools on early.

## 2. Reference apps

| App | Borrow |
|---|---|
| NotebookLM | Inline clickable citations to the source page; quizzes, flashcards and study guides from sources |
| ChatGPT / Gemini | Streaming answers, follow-up chat, history, 👍/👎 feedback on every answer, Study Mode / Guided Learning |
| Khanmigo | Hint-first (Socratic) tutoring; teacher dashboard; strong child-safety guardrails |
| Photomath / Gauth / Doubtnut | Snap a photo of the question; step-by-step math with proper notation |
| Quizlet / Anki | Flashcards with spaced repetition |
| Duolingo | Streaks and progress, used lightly (age-appropriate, no dark patterns) |
| Google Classroom | Join a class with a code; teacher role separate from admin; bulk roster import |
| PhysicsWallah / Vedantu | Board/chapter-wise organisation; Hindi + English |

## 3. Standards checklist

### A. Student experience
| # | Standard | Status | Note |
|---|---|---|---|
| A1 | Markdown + math rendering on screen | ✅ | 2026-10-17: react-markdown + GFM tables; prompts ask for Unicode math; stray LaTeX converted (`src/lib/tidy-math.ts`) |
| A2 | PDF supports math symbols and Hindi | ✅ | 2026-10-17: embedded Noto Sans → Noto Sans Math → Noto Sans Devanagari fallback; lists, tables, page numbers; footer bug fixed |
| A3 | Streaming answers | ❌ | 10–30 s blank wait today |
| A4 | Inline citations `[Source n, p.x]` linking to the page image | ⚠️ | Sources listed below the answer, not cited inline |
| A5 | Follow-up chat on an answer | ❌ | Every request is one-shot |
| A6 | Snap/upload a photo of the question | ✅ | 2026-10-17: up to 3 photos per request, downscaled in the browser; sent to the model directly and transcribed to search the knowledge base |
| A7 | Hint mode (hint → next step → full solution) | ❌ | Admin can make it the default per school |
| A8 | Subject picker | ❌ | Locked to `subject_ids[0]` |
| A9 | Explicit "Research the web" toggle | ❌ | Grounding only auto-triggers when similarity < 0.55 |
| A10 | History: searchable, re-open, delete | ✅ | 2026-10-17: answers saved with text and sources; My Documents opens, renames, deletes; each answer has its own page (search not yet) |
| A11 | Quizzes and flashcards (spaced repetition) from notes | ❌ | |
| A12 | 👍/👎 + "report a problem" on each answer | ❌ | Needed for the quality loop |
| A13 | Quota meter visible to the student | ⚠️ | Only shown as an error on hitting the limit |
| A14 | PDF generated on demand, not on every answer | ✅ | 2026-10-17: `/api/documents/[id]/pdf` renders from the saved answer; nothing stored; older stored PDFs still served |
| A15 | Mobile-first, installable (PWA) | ✅ | 2026-10-17: phone layouts checked at 375 px; 44 px tap targets on phones; manifest + icons (add to home screen); Print button prints just the answer. No offline mode |
| A16 | Hindi/regional UI and answers | ❌ | |
| A17 | Accessibility (WCAG 2.1 AA: contrast, keyboard, labels) | ⚠️ | 2026-10-17: errors announced (`role="alert"`), successes (`role="status"`); full audit not done |
| A18 | Onboarding, empty states, friendly errors | ⚠️ | |
| A19 | Upload Word (.docx) worksheets | ✅ | 2026-10-17: text read in the browser, indexed directly |
| A20 | Answers and papers follow Indian school exam conventions | ✅ | 2026-10-17: question types, marks-to-length, A–D section pattern, total marks choice (20/40/80/100) |
| A21 | Code in answers (HTML, Python, etc.) | ✅ | 2026-10-17: code blocks styled and scrollable on screen, monospace with indentation in the PDF (Noto Sans Mono); page reading copies code exactly and labels side boxes and figures |
| A22 | Attach PDF/Word files to a question (not only photos) | ✅ | 2026-10-17: up to 12 images within the size budget; Word text sent with the question |
| A23 | Worksheets: one search per question | ✅ | 2026-10-17: questions split (Q.1, 1., "1.What", two-level sections, unnumbered sections, "* Question:" bullets), embedded in one batch, results interleaved |
| A24 | Check my child's answers | ✅ | 2026-10-17: handwriting labelled at reading time and never trusted as fact; ✓/✗ per answer with reason and score |
| A25 | Project briefs | ✅ | 2026-10-17: follows ticked options and limits; scaffolding, not a finished piece, when original work is required |
| A26 | Account page: name, change password, usage, delete account | ✅ | 2026-10-17 |
| A27 | Rename books and answers | ✅ | 2026-10-17 |

### B. School / teacher / parent
| # | Standard | Status | Note |
|---|---|---|---|
| B1 | Join by class code or invite link (vs manual approval of each signup) | ❌ | |
| B2 | Bulk student import (CSV) | ❌ | |
| B3 | Roles: super-admin / school admin / teacher / student / parent | ⚠️ | Only admin and student |
| B4 | Teacher dashboard: usage, topics studied, weak areas | ❌ | |
| B5 | ~~Board-level shared library~~ | — | Retired 2026-10-17: replaced by private per-account libraries ("bring your own book") |
| B6 | Per-school settings (hint-first, web research allowed, quota defaults) | ❌ | |
| B7 | Audit log of admin actions | ❌ | |

### C. AI quality
| # | Standard | Status | Note |
|---|---|---|---|
| C1 | Hybrid retrieval (vector + Postgres full-text) | ✅ 2026-10-25 | Exact refs like "Ex 3.2 Q5" match poorly on vectors alone |
| C2 | Eval set: golden questions per subject, run on every prompt/model change | ❌ | |
| C3 | Prompt versioning (stored with each answer) | ❌ | |
| C4 | Child-safety guardrails: age-appropriate refusals, self-harm escalation text | ⚠️ | Relies on provider defaults |
| C5 | Prompt-injection resistance (uploaded content and student input are data, not instructions) | ⚠️ | |
| C6 | Answer caching for repeated questions | ❌ | Cost saver |
| C7 | Vector index suited to growing data | ✅ | 2026-10-17: searches are per owner with an exact scan (no approximate index), which always returns true top matches at this scale |

### D. Engineering & operations
| # | Standard | Status | Note |
|---|---|---|---|
| D1 | Current Google SDK (`@google/genai`) | ❌ | `@google/generative-ai` is Google's superseded SDK |
| D2 | Background jobs for ingestion (queue + retries), not a 300 s request | ❌ | Sequential per-chunk embedding can time out; partial chunks remain on failure; re-upload duplicates |
| D3 | Batch embeddings | ✅ | 2026-10-17: `batchEmbedContents`, one request per page when indexing and per worksheet when searching |
| D4 | Input validation on every API route | ✅ | 2026-10-17: ids (UUID), text lengths, page numbers, quotas, model names, uploads, photos validated server-side (`src/lib/validate.ts`); zod not adopted |
| D5 | Rate limiting per user | ❌ parked | Quota caps cost; concurrent requests can still overshoot slightly. Revisit before opening sign-ups |
| D6 | Full usage accounting (embeddings, OCR) | ❌ | Only completions are counted |
| D7 | Uploads direct to R2 via presigned URLs | ❌ | Vercel's ~4.5 MB body limit vs the 5 MB batch cap |
| D8 | Automated tests | ⚠️ | 2026-10-17: database security suite (`npm run test:db`, 25 checks: anon lockdown, privilege escalation, owner-only search, last-admin guard). No unit or e2e tests yet |
| D9 | CI on every PR: lint, typecheck, build, tests (GitHub Actions) | ❌ | |
| D10 | Error monitoring (e.g. Sentry free tier) + structured logs | ❌ | |
| D11 | Security headers / CSP | ⚠️ | 2026-10-17: nosniff, frame DENY, referrer and permissions policies on; CSP in report-only mode, enforce after a clean test pass |
| D12 | Env-var validation at startup | ⚠️ | Header-safety check only |
| D13 | Staging environment (Vercel previews + separate free Supabase project) | ❌ | |
| D14 | Dependency updates | ⚠️ | 2026-10-17: `npm audit --omit=dev` is part of the release checklist; Next.js upgraded 16.3.2 → 16.4.2 (critical advisories). Dependabot not set up |
| D15 | Backups / restore drill | ⚠️ | Free plan: daily backups, no point-in-time recovery |
| D16 | Product analytics, privacy-friendly | ❌ | |
| D17 | DB migrations via GitHub → Supabase integration | ✅ | Done 2026-10-17 |
| D18 | RLS hardened | ✅ | Migration `20261017000004_tighten_rls.sql` |

### E. Accounts, privacy & legal
| # | Standard | Status | Note |
|---|---|---|---|
| E1 | Forgot / reset password | ✅ | 2026-10-17: `/forgot-password` → email link → `/reset-password`; never reveals whether an email has an account. Also reachable from Account as "Change password" |
| E2 | Custom SMTP for auth emails (e.g. Resend free tier) | ❌ | Supabase default sender is heavily rate-limited |
| E3 | Verifiable parental consent for under-18s (India DPDP Act 2023) | ⚠️ | Largely avoided: adults-only accounts, no child accounts. Avoid storing children's personal data (names, photos) in prompts or profiles; confirm with legal review |
| E4 | Privacy policy, terms, data deletion and export on request | ⚠️ | 2026-10-17: Delete my account (books, page images, answers, usage) on the Account page. Policy/terms text and data export still needed |
| E5 | Content rights: school confirms the right to upload each book | ❌ | Checkbox + terms |
| E6 | No ads, no selling of student data | ✅ | By design |
| E7 | Google sign-in (schools use Google Workspace) | ❌ | Optional |

### F. Copyright, licences & provider terms (checked 2026-10-17; not legal advice)
| # | Item | Status | Note |
|---|---|---|---|
| F1 | **AI provider allows apps used by under-18s** | ⚠️ **Mitigated by repositioning, not yet confirmed** | 2026-10-17: Syllabi is now adults-only (parents/tutors), with an 18+ confirmation at signup and AI-generated notices. Residual risk: the terms also cover apps "likely to be accessed" by under-18s; a parent could let a child use their account. Get Google or legal confirmation before launch; keep Claude (allows minors with safeguards) as the fallback. Original finding: | Gemini API Additional Terms (modified 2026-04-28): "You must be 18 years of age or older to use the APIs" and API clients must not be "directed towards or is likely to be accessed by individuals under the age of 18". Syllabi serves school students, so this applies to completions **and** embeddings. Vertex AI / Google Cloud terms may contain similar language (unverified). Anthropic's usage policy (May 2024 update) allows API use in products for minors if the operator adds safety features (age verification, content moderation) and discloses AI use. Decide the provider before onboarding students; get legal confirmation. |
| F2 | Textbook copyright | ⚠️ **Mitigated 2026-10-17** | Switched to "bring your own book": each parent/tutor uploads their own copy, kept private to their account, with an ownership confirmation at upload — the same model as uploading a PDF to Claude or Gemini (user-provided, private, platform acts at the user's direction). Still needed: terms of service with a takedown process (E4), and a short legal check. Original finding: Ingestion copies whole pages (images + text) into storage. India Copyright Act s.52(1)(i) covers reproduction "in the course of instruction" (Delhi HC, *Rameshwari Photocopy*, 2016–17), but a commercial service storing and serving copies is not clearly covered. NCERT and private-publisher books are copyrighted; NCERT being free to read online is not a licence to copy. Mitigations: written permission/licence per publisher (or the school's own licence), uploader rights declaration (E5), content visible only to that school's enrolled students, show only cited page snippets, takedown process in the terms. |
| F3 | Past papers | ⚠️ | A school's own papers belong to the school (get its consent). Board sample papers (e.g. CBSE) are published openly but still copyrighted — confirm terms. |
| F4 | Grounding with Google Search display rules | ✅ 2026-10-17: Search Suggestions shown with grounded answers (sandboxed frame), stored with the saved answer for the user's own history; PDF notes web use. Original note: | If kept: show the returned Search Suggestions with grounded answers to that user only, don't modify or intersperse them, and don't cache them beyond the allowed exceptions. Today the PDF and history store grounded output without suggestions. |
| F5 | Open-source licences | ✅ | All permissive; notices in `THIRD_PARTY_NOTICES.md` (BMAD MIT notice, pdf.js Apache header). |
| F6 | Name "Syllabi" | ⚠️ | No conflicting product found in a web search; "syllabi" is a common word, so it is hard to register but low-risk. Search IP India (ipindiaservices.gov.in) and the USPTO before branding spend. |
| F7 | Competitor references | ✅ | Ideas and features are not copyrightable. Don't copy others' code, UI assets, text or logos; naming competitors in internal docs is fine. |

### H. Full app review, 2026-10-17 (fixed)
| Area | Finding | Fix |
|---|---|---|
| Security | Open redirect: `next` after sign-in could point to another site | `safeNext()` allows same-site paths only (sign-in, callback) |
| Security | Login/signup pages displayed any text from the URL | Messages chosen by key from fixed lists (`src/lib/auth-messages.ts`) |
| Security | Sign-in error revealed provider text | One message for wrong password and unknown email |
| Security | Gemini key sent in URL query for embeddings | `x-goog-api-key` header, checked header-safe |
| Security | Unvalidated ids, lengths, numbers in APIs | Validation everywhere (D4) |
| Reliability | Signed-out/blocked API calls got an HTML redirect | JSON 401/403 with a plain message |
| Reliability | Failed account-row insert left a login stuck on "pending" | Error handled; half-made login removed |
| Reliability | Unfinished uploads could feed answers | `match_owner_chunks` searches ready books only (migration 8, tested) |
| Reliability | Gemini 429/503 "overloaded" not retried | Two retries with backoff (calls and embeddings) |
| Reliability | Blocked answers crashed; long answers cut off silently | Plain message; visible "reached the length limit" note; 32k output tokens |
| Reliability | Answer routes had no time limit set (Vercel default can be 10–60 s) | `maxDuration = 300` |
| Reliability | Up to 30 page images per upload request could exceed 300 s | At most 8 page images per request; 60 pages per upload |
| Reliability | An answer was lost if PDF making or storage failed | Answer saved first; PDF on demand (A14) |
| Performance | Admin Accounts made one query per account | `monthly_usage_all()` |
| Performance | My Documents downloaded every answer's full text | List selects only what it shows |
| UX | Rename pencil only appeared on mouse hover (invisible on phones) | Always visible on phones |
| UX | Links in answers replaced the page; PDF showed raw link markup | New tab; "text (address)" in PDF |
| UX | Blank screen if an app page crashed | Friendly error page |
| Quality | Page reading and Ask anything on Flash-Lite (handwriting, judging answers) | Moved to Flash (decision) |

### G. Borrowed from the Next.js + Supabase best-practices checklist (2026-10-17)
| Practice | Status | Where |
|---|---|---|
| Anonymous lockdown: no table or function reachable without sign-in | ✅ | Migration `20261017000007_lockdown_and_admin_guard.sql` (found: anyone could call `student_monthly_usage` for any user) |
| Keep at least one active admin (database trigger) | ✅ | Same migration |
| Business time zone for monthly quotas (India) | ✅ | Same migration |
| `search_path` set on definer functions; execute granted only where needed | ✅ | Same migration |
| Test security with direct calls as each role | ✅ | `supabase/tests/10_security.test.sql` via `npm run test:db` |
| Never show raw database/provider errors | ✅ | `src/lib/errors.ts` (`userMessage`, `UserError`) |
| Read failures never look like empty lists | ✅ | Dashboard, My books, My Documents |
| Heavy libraries load on demand | ✅ | pdf.js loads only when a PDF is picked |
| One date format (dd-mm-yyyy, India time) | ✅ | `src/lib/format.ts` |
| PDF fonts cover ₹ and the local script | ✅ | A2 |
| App and database in nearby regions | ✅ | Mumbai / `bom1` |
| Phone tap targets, 16 px inputs, home-screen install | ✅ | A15 |
| npm audit each release | ✅ | `release-checklist.md` |
| Decisions on record, release checklist, live check list | ✅ | `decisions.md`, `release-checklist.md` |
| Audit log of admin actions | ❌ parked | B7 |
| Idle sign-out | ❌ parked | `decisions.md` |
| Paging past PostgREST's 1,000-row cap | ❌ later | Lists are small during testing; needed before many books/answers per account |
| **Discarded** (inventory-specific): ledgers and stock, units and money rounding, QC approvals and retests, sequence numbering, Excel export and formula injection, `ilike` escaping, patch-file delivery | — | Not applicable to Syllabi |

## 4. Suggested release slices

1. **Before first real students:** F1 (provider terms — blocker), F2, F4, A1, A2, A8, D1, D2+D3, D4, D7, D8 (minimal), D9, D11, E1, E2, E3, E4, E5.
2. **v1 (worth switching from NotebookLM):** A3, A4, A5, A6, A7, A9, A12, A13, A14, C1, C2, B1, B5, D5, D6, D10.
3. **v1.x:** A10, A11, A15, A16, B2, B3, B4, B6, C3–C7, D13–D16, E7.

Open product questions for the PRD:
- First pilot customer (one school / tutor)?
- Expected student count?
- Pricing model?
- Default to hint-first?
