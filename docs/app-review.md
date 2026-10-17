# Syllabi — Product Review & Standards Baseline

Input for BMAD planning (PRD, epics, stories). Written 2026-10-17 from a read of the code and a comparison with leading apps. Status: ✅ done · ⚠️ partial · ❌ missing.

## 1. Positioning

- **Customer:** schools, coaching centres and tutors (the payer), serving their students (the users). Not individual students: for one student alone, Google NotebookLM is free and more polished.
- **Why Syllabi wins for that customer:**
  - Curated once by the admin, not uploaded per student.
  - Each student is auto-scoped to their school/grade/subject.
  - Admin approves and revokes access.
  - Hard per-student cost cap.
  - Sample papers in the school's own past-paper style.
  - Visibility for teachers and parents.
  - Designed for minors (consent and safety).
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
| A1 | Markdown + math rendering on screen | ❌ | Shown as raw text (`whitespace-pre-wrap`); needs markdown + KaTeX |
| A2 | PDF supports math symbols and Hindi | ❌ | Built-in Helvetica has no √ π ≤ ∫ and no Devanagari; embed Noto fonts |
| A3 | Streaming answers | ❌ | 10–30 s blank wait today |
| A4 | Inline citations `[Source n, p.x]` linking to the page image | ⚠️ | Sources listed below the answer, not cited inline |
| A5 | Follow-up chat on an answer | ❌ | Every request is one-shot |
| A6 | Snap/upload a photo of the question | ❌ | Text prompt only |
| A7 | Hint mode (hint → next step → full solution) | ❌ | Admin can make it the default per school |
| A8 | Subject picker | ❌ | Locked to `subject_ids[0]` |
| A9 | Explicit "Research the web" toggle | ❌ | Grounding only auto-triggers when similarity < 0.55 |
| A10 | History: searchable, re-open, delete | ⚠️ | PDF list only |
| A11 | Quizzes and flashcards (spaced repetition) from notes | ❌ | |
| A12 | 👍/👎 + "report a problem" on each answer | ❌ | Needed for the quality loop |
| A13 | Quota meter visible to the student | ⚠️ | Only shown as an error on hitting the limit |
| A14 | PDF generated on demand, not on every answer | ❌ | Wastes time and storage |
| A15 | Mobile-first, installable (PWA) | ⚠️ | Responsive Tailwind; no PWA |
| A16 | Hindi/regional UI and answers | ❌ | |
| A17 | Accessibility (WCAG 2.1 AA: contrast, keyboard, labels) | ⚠️ | Not audited |
| A18 | Onboarding, empty states, friendly errors | ⚠️ | |

### B. School / teacher / parent
| # | Standard | Status | Note |
|---|---|---|---|
| B1 | Join by class code or invite link (vs manual approval of each signup) | ❌ | |
| B2 | Bulk student import (CSV) | ❌ | |
| B3 | Roles: super-admin / school admin / teacher / student / parent | ⚠️ | Only admin and student |
| B4 | Teacher dashboard: usage, topics studied, weak areas | ❌ | |
| B5 | Board-level shared library (NCERT once, used by all CBSE schools) | ❌ | Taxonomy is per school, so the same book is re-ingested per school |
| B6 | Per-school settings (hint-first, web research allowed, quota defaults) | ❌ | |
| B7 | Audit log of admin actions | ❌ | |

### C. AI quality
| # | Standard | Status | Note |
|---|---|---|---|
| C1 | Hybrid retrieval (vector + Postgres full-text) | ❌ | Exact refs like "Ex 3.2 Q5" match poorly on vectors alone |
| C2 | Eval set: golden questions per subject, run on every prompt/model change | ❌ | |
| C3 | Prompt versioning (stored with each answer) | ❌ | |
| C4 | Child-safety guardrails: age-appropriate refusals, self-harm escalation text | ⚠️ | Relies on provider defaults |
| C5 | Prompt-injection resistance (uploaded content and student input are data, not instructions) | ⚠️ | |
| C6 | Answer caching for repeated questions | ❌ | Cost saver |
| C7 | Vector index suited to growing data (HNSW, or IVFFlat rebuilt after load) | ⚠️ | IVFFlat built on an empty table |

### D. Engineering & operations
| # | Standard | Status | Note |
|---|---|---|---|
| D1 | Current Google SDK (`@google/genai`) | ❌ | `@google/generative-ai` is Google's superseded SDK |
| D2 | Background jobs for ingestion (queue + retries), not a 300 s request | ❌ | Sequential per-chunk embedding can time out; partial chunks remain on failure; re-upload duplicates |
| D3 | Batch embeddings | ❌ | One API call per chunk |
| D4 | Input validation on every API route (zod) | ❌ | zod installed but unused |
| D5 | Rate limiting per user | ❌ | Quota is checked before the call, so concurrent requests overshoot |
| D6 | Full usage accounting (embeddings, OCR) | ❌ | Only completions are counted |
| D7 | Uploads direct to R2 via presigned URLs | ❌ | Vercel's ~4.5 MB body limit vs the 5 MB batch cap |
| D8 | Automated tests: unit (chunking, quota, scoping) + one e2e smoke test (Playwright) | ❌ | No tests |
| D9 | CI on every PR: lint, typecheck, build, tests (GitHub Actions) | ❌ | |
| D10 | Error monitoring (e.g. Sentry free tier) + structured logs | ❌ | |
| D11 | Security headers / CSP | ❌ | `next.config.ts` sets none |
| D12 | Env-var validation at startup | ⚠️ | Header-safety check only |
| D13 | Staging environment (Vercel previews + separate free Supabase project) | ❌ | |
| D14 | Dependency updates (Dependabot) | ❌ | |
| D15 | Backups / restore drill | ⚠️ | Free plan: daily backups, no point-in-time recovery |
| D16 | Product analytics, privacy-friendly | ❌ | |
| D17 | DB migrations via GitHub → Supabase integration | ✅ | Done 2026-10-17 |
| D18 | RLS hardened | ✅ | Migration `20261017000004_tighten_rls.sql` |

### E. Accounts, privacy & legal
| # | Standard | Status | Note |
|---|---|---|---|
| E1 | Forgot / reset password | ❌ | No flow exists |
| E2 | Custom SMTP for auth emails (e.g. Resend free tier) | ❌ | Supabase default sender is heavily rate-limited |
| E3 | Verifiable parental consent for under-18s (India DPDP Act 2023) | ❌ | Legal review needed |
| E4 | Privacy policy, terms, data deletion and export on request | ❌ | |
| E5 | Content rights: school confirms the right to upload each book | ❌ | Checkbox + terms |
| E6 | No ads, no selling of student data | ✅ | By design |
| E7 | Google sign-in (schools use Google Workspace) | ❌ | Optional |

## 4. Suggested release slices

1. **Before first real students:** A1, A2, A8, D1, D2+D3, D4, D7, D8 (minimal), D9, D11, E1, E2, E3, E4, E5.
2. **v1 (worth switching from NotebookLM):** A3, A4, A5, A6, A7, A9, A12, A13, A14, C1, C2, B1, B5, D5, D6, D10.
3. **v1.x:** A10, A11, A15, A16, B2, B3, B4, B6, C3–C7, D13–D16, E7.

Open product questions for the PRD:
- First pilot customer (one school / tutor)?
- Expected student count?
- Pricing model?
- Default to hint-first?
