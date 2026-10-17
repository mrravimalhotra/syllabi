# Test scenarios

The kinds of files and requests real parents and tutors bring, distilled from the owner's sample school material (Grade 6–7, Indian school: Social Science, Civics, Maths and Computer studies). Nothing from those books or worksheets is stored in this repository.

## Running the automatic part

1. Put sample files (PDF, Word .docx, phone photos) in `test-material/`. The folder is git-ignored and must never be committed: the material is the schools' and publishers' copyright.
2. Run `npm run scenarios`. Each file goes through the app's real browser-side processing in Chromium (PDF pages, Word text and pictures, photo downscaling, question splitting), and the run writes `test-material/report.md`.
3. Every file should be processed. Check the notes column for limits (pages per upload, images per question).

Last run (2026-10-17): 27 sample files, 27 processed, 0 failed.

The AI steps (reading pages, answering) need the deployed app with API keys. Run them as live checks with the scenarios below; the ★ ones matter most.

## Scenarios

| # | Input | Request | Expected |
|---|---|---|---|
| S-01 ★ | Phone photos of a textbook chapter: curved pages, fingers, facing page at the edge, side boxes ("Fact File"), figures, pen underlines | Upload to My books | Every page `ready`; side boxes labelled; facing-page text and page furniture left out; pen marks ignored |
| S-02 ★ | Textbook exercise page with the child's handwritten answers, one of them wrong | Upload to My books, then ask a question on that topic | The wrong handwritten answer is never repeated as fact; the printed book wins |
| S-03 ★ | Photo of a completed worksheet (fill-ins, true/false, ticked MCQ options) | Ask anything: "Check my child's answers" with the photo | Each answer ✓/✗ with the correct answer and a reason; spelling noted; score like 7/9 |
| S-04 ★ | Exercise as PDF or Word with 8–20 questions on different topics | Step-by-step solution with the file attached: "Answer all questions" | Every question answered in order, each sized to its marks; each uses material on its own topic (one search per question) |
| S-05 | Two-level numbering ("Q1. Fill in the blanks" with items 1–4, "Q3. MCQ" with i–iv options) | Same as S-04 | Items answered under their section; MCQs give the option letter and text |
| S-06 | Unnumbered questions under headings (A. Knowledge, B. Competency-based, C. HOTS) | Same as S-04 | All questions found and answered, grouped by heading |
| S-07 | "* Question:" bullet lists | Same as S-04 | All questions answered |
| S-08 ★ | Word worksheet whose measures or figures are pictures (e.g. lines and angles constructions) | Upload to My books, and attach to a question | Pictures read with their position ("after Q1 ..."); construction answers are numbered ruler-and-compass steps |
| S-09 | Scanned or screenshot PDF with no text layer (dark-mode screenshot, scanner app) | Upload and ask | Read by AI; same results as a text PDF |
| S-10 | Large scanned chapter PDF (15+ pages) | Upload to My books | Uploads in a few requests; all pages `ready` |
| S-11 ★ | 80-mark question paper (Word) uploaded as a past paper | Sample paper, Total marks 80, for that unit | Sections A–D in the school's own pattern, marks add up, answer key |
| S-12 ★ | Maths revision sheets (decimals, percentages, ratio, speed-distance-time, metric units) | Step-by-step solution for a word problem; Answer all questions | Given / To find / Solution, units on every line, **Answer:**; conversions shown |
| S-13 | Maths sample paper with geometry figures (intersecting lines, labelled points) | Ask about a question that needs its figure | Uses the figure if attached; otherwise says which figure is needed |
| S-14 ★ | Project brief photos (e.g. group rap song on conservation) with the chosen topic ticked and rules (max 3 stanzas or 15 lines, original lyrics only) | Ask anything: "Help us with this project" | Follows the ticked topic and every rule; research points, plan, structure, and a short labelled "Example to adapt", not a finished song to submit |
| S-15 | Handwritten teacher note on a page (e.g. a project topic and format: "what it is, disadvantages, how to reduce it, 5 A4 sheets") | Ask anything: "Help with this assignment" | Reads the handwriting as the brief; plan sized to the format |
| S-16 | Computer studies chapter with code (HTML) and screenshots | Ask for code ("basic structure of an HTML document") | Code block, correctly nested; one line on what it displays; PDF keeps indentation |
| S-17 | Textbook pages with a map and a timeline | Ask "Which mahajanapadas were monarchies?" style questions | Uses the map labels and timeline entries |
| S-18 | Comparison table in a textbook photo (e.g. website vs blog) | Ask a "differentiate between" question | Two-column table answer |
| S-19 | Revision notes request for a chapter with "Let's sum up" and key vocabulary pages | Revision notes | Notes use the chapter's terms; end with Key terms and Likely questions |
| S-20 | Hindi request on any chapter | Ask in Hindi | Answer in Hindi; PDF prints Devanagari correctly |
