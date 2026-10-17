# Release checklist

Adapted from the Next.js + Supabase best-practices checklist for Syllabi. Run part 1 before every push to `main`; run part 2 after every release, and the full part 2 list before opening sign-ups.

## 1. Before pushing to `main` (developer)

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean; no new warnings.
- [ ] `npm run scenarios` (when `test-material/` has the sample files) — every file processed; see `docs/test-scenarios.md`.
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

Also run the ★ scenarios in `docs/test-scenarios.md` with real sample files.

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
| T-22 | My books: upload a Word (.docx) worksheet | Indexed as text pages; quota barely moves (no page reading) |
| T-23 | Sample paper, Total marks 80, for a chapter you uploaded | Sections A–D with marks and word limits, tagged questions, marks add up to 80, answer key |
| T-26 | Sign out, then use **Forgot password?** on the sign-in page | Same message whether or not the email exists; the email link opens "Choose a new password"; new password works |
| T-27 ★ | Generate an answer, then open **My Documents** | Answer listed; opens on its own page; rename, Print, PDF and Delete work |
| T-28 | Ask something your books don't cover | Answer shows Google's search suggestion chips under it; the PDF notes web use |
| T-29 | Account page: change your name; open Change password | Name saved; password page opens |
| T-31 ★ | Generate → **Study pack** → choose a story chapter from My books → Generate | Within about 3 minutes: Story tab with 4-8 parts (characters, feelings, words from the book), Textbook Q&A with every exercise question numbered as in the book, a practice test, a glossary; saved in My Documents |
| T-32 | In that pack: open answers, compare 3 quotes with the book; tap Read aloud; "Make it simpler" on one answer, then Undo; Print; PDF | Quotes marked "Found in the book" are in the book word for word; read-aloud uses an Indian English voice where the phone has one; Undo restores the answer; print and PDF show every section with the current answers |
| T-33 | Study pack for a science or maths chapter (an information chapter), and one from attached photos instead of My books | "Key ideas" instead of a story (no characters or feelings); maths answers show Given / To find / steps; the photo pack works too |
| T-34 | Account → set Child's class and School board; then Sample paper with a school's past paper attached | Answers suit that class; the paper copies the school's header, instructions and numbering; the answer key starts on a new page in Print and PDF; "Questions only" gives the paper without answers |
| T-35 ★ | Upload a Hindi or Marathi chapter (and a French lesson); ask a question from it with Answer in = "Same as the book", then = English; make a study pack; Read aloud; PDF | Pages are read in Devanagari/French, not translated; answers follow the chosen language; quotes show "Found in the book"; read-aloud uses a Hindi/Marathi/French voice where the phone has one; the PDF shows conjuncts and accents correctly |
| T-36 ★ | Upload a digital PDF worksheet (typed, not scanned) to My books | Pages show a green "Text" tag and the note says no AI reading is needed; the upload is quick; Admin → token usage shows no page-reading tokens for it |
| T-37 | Ask the same question twice; then press "Make a new answer" | Second time: "You asked this before" appears instantly, no tokens used; "Make a new answer" generates afresh |
| T-38 ★ | Solve a maths worksheet; make an 80-mark sample paper | Under the answer: "N calculations checked by an exact calculator: all correct" (or problems listed); the paper shows "Marks add up to 80" and "Answer key covers all N questions" |
| T-39 | Study pack practice test with MCQ and true/false questions | Tapping an option marks it at once (green/amber, "Correct!"), Next moves on, and the score counts it |
| T-40 ★ | Solve: type "Divide 6008 by 4", then "Find the HCF and LCM of 12, 18 and 30" | A chalkboard worked example appears instantly ("Exact: worked out by code, no AI"); Play reads each step aloud and moves on; Show all, Print and My Documents work; no tokens used |
| T-41 | Solve a worksheet that includes "Divide 125 by 5" among other questions | The AI answer has "See it worked out: Long division: 125 ÷ 5" under it, which opens the chalkboard |
| T-42 | Solve: "4567 + 789", then "6008 − 49", then "Add 12.5, 3.75 and 100" | Column boards: carries written small above the column; borrowing across zeros shows 9s with the old digits greyed; decimal points line up and empty places are filled with grey zeros |
| T-43 | Solve: "234 × 56", then "Multiply 1.25 by 0.4" | Long multiplication: one row per digit with the 0 placeholder, then the partial products added; for decimals the point is placed at the end (0.5) |
| T-44 | Solve: "Add 1/2 + 2/3", then "Simplify 18/24", then "2/5 - 3/4" | Fractions drawn top over bottom: LCM step with ×3/×2 written beside each fraction, numerators added, ÷HCF to simplify; 7/6 also shown as 1 1/6; −7/20 for the negative answer |
| T-45 | Solve: "Convert 3.45 km to m", then "45 mm in m", then "5 l = ? ml"; also "28 m 68 cm in metres" | A km…mm place-value chart: digits written under the unit, empty places filled with 0, answer read under the new unit (3450 m, 0.045 m, 5000 ml). The mixed "28 m 68 cm" goes to the AI instead |
| T-30 | Create a throwaway second admin, then delete that account from its Account page | Account and its books are gone; deleting your only admin account is refused |
| T-25 ★ | Upload phone photos of a Computer chapter with code (e.g. HTML), then ask "Write the basic structure of an HTML document" | Answer has a code block that keeps its indentation; on the phone only the code box scrolls; the PDF shows the code in a typewriter-style font |
| T-24 | Step-by-step solution: "Answer all questions in this worksheet" with a worksheet photo or upload | Every question answered in order, each sized to its marks |
