# Exercises: how Syllabi finds and answers them

Worked out from the owner's sample chapter (History, Unit 1: Bhakti Movement, Grade 7): pages 1 to 10 are the lesson, 11 to 12 a "Textual Exercise", 13 to 15 worksheet RW-1.1. The test data is `scripts/fixtures/bhakti-exercise-pages.ts`; the checks are in `scripts/practice/test.ts` ("Sample chapter" and "Layouts").

## Telling the app which pages are exercises

1. **When uploading a book** (My books → Add a book), set **Kind of material → Exercise** on pages 11 to 15 (each page card has its own menu). Then "Solve the exercise" brings in the whole unbroken run of Exercise pages around the best match, with their pictures.
2. **In the question**, name the pages: "Solve the questions on pages 11 to 15", or say "exercise", "worksheet" or "all questions".
3. **Attaching a PDF in Generate**: choose the pages (From page 11 to page 15). Up to 12 pages per question.

## Question kinds in the sample, and what the answer is expected to be

| Kind (example) | Answer |
|---|---|
| Fill in the blanks (Q1) | the missing word, in bold |
| True or false (Q2) | **True**/**False** and a one-line reason |
| Assertion and Reason (Q3.1, Q.I.2) | option letter and text, one line why |
| Arrange in order (Q3.2) | option letter and the events written out in order |
| Complete the sentence with options on the next page (Q3.3) | option and name |
| Picture-based (Q3.4 "Fig. 1.17", Q.II.4 Surdas) | what the picture shows, then the answer (needs the page picture) |
| Verbal analogy (Q.I.1) | the missing word and the relationship |
| Short answer (Q4) | one line |
| Detailed answer (Q5, Q.II) | 4 to 6 sentences with reason and example; the ruled lines left on the sheet show the length |
| Passage with sub-questions (Q5.4) | each sub-part answered from the passage |

## What was fixed because of the sample

- Headings written in Roman numerals (`Q.I.`, `Q.II.`) were not recognised, so the worksheet's questions were filed under the exercise's last heading ("Q5. Answer in detail") and were not section labels when indexed.
- Options written `a.` `b.` `c.` `d.` were taken for new sections, so a question whose options were lettered lost its heading.
- The page reader is now told to keep section headings, numbers and options on their own lines, how to write "answer space" lines (a length hint), to place a referred-to figure just before its question, and to keep the worksheet's title line.
- Answers are asked to carry the section with the number (**Q3.2**, **Q.II.4 (b)**), because numbering restarts under every heading, and to cover every question to the last page.

## Questions inside the lesson

Warm-up, Source Analysis, 21st Century Skills (research questions), Think and Answer, Check your understanding and similar boxes are questions to answer too, even though no exercise is marked. The page reader writes each box as `[Questions: <box title>]` followed by its passage, poem or picture and its numbered questions. A whole-exercise request ("solve the exercise", "all questions in the chapter", "warm-up") brings in every such box of the book, in page order ahead of the exercise, and answers are labelled with the box (**Warm-up Q1**). They are not added to a plain question or to named pages. Research questions ("research more about Mirabai") are answered from general knowledge and marked as not from the book. Books uploaded before this change keep their old page text: re-upload (or retry) a book to get the box markers.

## Handwritten answers on the page

Workbook pages often carry a student's handwritten answers (the sample: Geography Unit 2, "Black Soil" with a bullet list of crops; "Red Soil"). They are reference only:
- the page reader writes the printed question alone, then the handwriting as `[Handwritten answer: ...]` (crossed-out words left out, inserted words put in place);
- searches and the question list use the printed text only (the handwriting is not embedded and its bullets and numbers are never counted as questions);
- the AI is given the printed question and, separately, "Student's handwritten attempt, for reference only", and is told to write each answer fresh from the book, rewriting the attempt when it agrees with the book and leaving it out or correcting it, without copying or remarking on it, when it is wrong or incomplete;
- the exception is when you ask it to check or mark the answers, which judges the handwriting as before.
Books already uploaded keep their old page text, which may have the handwriting mixed into the printed text: re-upload them to get the clean separation.

## Known limits

- Printed page numbers can restart (the worksheet's pages print as 2 and 3). "Page 2" in a request means the 2nd page *uploaded*, not the printed number.
- When asking from My books, the app cannot count how many questions the exercise has, so it cannot warn if one is skipped; attach the pages in Generate to get that check.
- Page pictures, not text, carry figures: the answer depends on the page reader describing them well.
