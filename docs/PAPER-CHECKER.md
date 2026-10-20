# Paper checker (Generate → Check paper)

A teacher-style marking of a student's solved maths paper. Attach photos or a PDF of the paper (several sums are fine; a PDF over 12 pages asks which pages), or type the sums with the student's working. It uses no book.

## What it does

For every sum the AI first solves it itself, then reads the student's working step by step and marks **method** (about 60%: setting up, steps, operations, units) and **answer** (about 40%). Rules it follows:
- a correct method with a slip keeps the method marks and says where the slip is; a wrong value used correctly afterwards earns the later method marks (follow-through);
- a correct answer with no working gets only the answer marks ("show your steps"); a wrong answer with a sound method gets most of the method marks; no attempt is 0; half marks are allowed; never full marks for a wrong answer;
- sums with parts split their marks across the parts.

**Marks:** the marks printed on the paper are used; if none are printed and none are given, **5 per question**; the **Marks per question** box sets it for every question.

**The report:** a score card (marks, percentage, grade), a table (Q, Max, Marks, Steps ✓/✗/~, Answer), then for each question the question as read, the correct answer, the student's steps with ✓ or ✗ and what to change, the marks split, and **To do better**; then overall feedback: **Well done**, **Work on** (patterns of mistakes) and **Next steps** (three things to practise this week). It is saved in My Documents (kind: Paper check) and can be printed or made into a PDF.

**Grades:** A+ 90% and above, A 80 to 89, B+ 70 to 79, B 60 to 69, C 50 to 59, D 40 to 49, E under 40.

## What code checks (so the AI's own arithmetic can't slip)

- Every question's marks are within its maximum (and out of the set marks per question, when one is set).
- The table adds up to the total shown; the percentage and the grade follow from it; each question heading agrees with its table row.
- The teacher's own sums are recomputed by the exact calculator (lines quoting the student's wrong working are left out).
If anything fails, the AI is asked once to correct the report, and the checks are shown under it.

## Limits

- Handwriting is read from the photos by the AI: a hard-to-read photo can be misread, so check a surprising mark against the paper.
- The marking of the working is the AI's judgement; only the marks arithmetic and the sums are checked by code. Read the comments before using a grade.
- Maths only for now (other subjects: later). Model: Admin → AI models → Paper checker.
