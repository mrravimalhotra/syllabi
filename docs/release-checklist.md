# Release checklist

Adapted from the Next.js + Supabase best-practices checklist for Syllabi. Run part 1 before every push to `main`; run part 2 after every release, and the full part 2 list before opening sign-ups.

## 1. Before pushing to `main` (developer)

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean; no new warnings.
- [ ] `npm run test:db` — every check PASS (builds a fresh Postgres from all migrations and attacks it as anon, a user and the server).
- [ ] New table → RLS on, policies written, and a check added to `supabase/tests/`. New function → `search_path` set, EXECUTE granted only where needed (anon gets nothing).
- [ ] Rules that matter are enforced in the database (RLS, constraint, trigger), not only in an API route.
- [ ] Inputs validated on the server (type, size, allowed values); errors shown through `userMessage()`, never raw database/provider text.
- [ ] `npm audit --omit=dev` — no known vulnerabilities, or each accepted one recorded in `decisions.md` with a reason.
- [ ] Phone width (375 px): no sideways page scroll; tap targets ≥ 44 px; inputs 16 px.
- [ ] Every action shows a result (success or plain error); lists that fail to load say so instead of looking empty.
- [ ] Docs updated: `HANDOFF.md` status, `app-review.md` statuses, `decisions.md` for any new decision.
- [ ] Stage files by name (no `git add -A` surprises); one migration per change.

## 2. Live checks after release (owner, on the real site)

Tick each one and note anything odd. Use your phone for the starred (★) checks.

| # | Check | Expected |
|---|---|---|
| T-01 | Open the site signed out | Lands on the sign-in page |
| T-02 | Sign up with a different email than `ADMIN_EMAIL` | Refused: "Syllabi is in private testing…" |
| T-03 | Sign up with `ADMIN_EMAIL`, then make it admin (SQL in `DEPLOYMENT.md`) | Sign-in works; Admin link visible |
| T-04 | Admin → Accounts: try to revoke your own access or make yourself "user" | Refused: "Syllabi needs at least one active admin…" |
| T-05 ★ | My books: upload 3–5 photos of a textbook chapter, tick the ownership box | Status becomes `ready`; quota usage goes up |
| T-06 | My books: upload a PDF (10+ pages) | All pages indexed; no error |
| T-07 | Upload without ticking the ownership box | Refused with a clear message |
| T-08 ★ | Generate → Step-by-step solution for a question from that chapter | Answer uses the book (sources listed with page images); headings/lists/tables display properly |
| T-09 ★ | Same, but attach a photo of a question instead of typing | Answer solves the photographed question |
| T-10 | Revision notes and Sample paper for the chapter | Sensible output; sample paper has marks and an answer key |
| T-11 | Ask a question the book doesn't cover | Answer still comes (web-supplemented note shown) |
| T-12 | Download PDF of an answer with maths symbols (√, ≤, π, x²) | Symbols, tables and page numbers print correctly |
| T-13 | Ask for an answer in Hindi; download its PDF | Hindi shows correctly on screen and in the PDF |
| T-14 ★ | Print button on an answer | Print preview shows only the answer, no menus |
| T-15 ★ | My Documents → Download on the phone | PDF opens (not blocked as a pop-up) |
| T-16 | Untick a book in "Use these books" and ask about it | Answer no longer cites that book |
| T-17 | Delete a book | It disappears; answers stop using it |
| T-18 ★ | Phone: add Syllabi to the home screen | Icon shows; opens like an app |
| T-19 ★ | Phone in dark mode: type in any field | Text clearly visible |
| T-20 | Admin → LLM Settings: change a model and generate again | Works with the new model |
| T-21 | Browser DevTools console on each page | No Content-Security-Policy reports (then CSP can be enforced) |
