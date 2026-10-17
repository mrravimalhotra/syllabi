# Study pack (from StoryLearner, refined)

A **study pack** turns one chapter into everything a parent or tutor needs to teach it:
a walkthrough of the chapter, every end-of-chapter question answered, a practice test
and a glossary, with read-aloud, print and PDF. It started as the StoryLearner
prototype (a single React file calling Claude from the browser). This is the
production design inside Syllabi.

## What changed from StoryLearner, and why

| StoryLearner | Syllabi study pack | Why |
|---|---|---|
| API key in the browser | All AI calls on the server, quota-checked and logged | A key in the page can be copied and run up any bill |
| Scanned pages read on every run | Uses the chapter already read into **My books** (or attached photos, transcribed once) | No re-reading, cheaper, faster, and the quotes can be checked |
| "Return JSON only" in the prompt | Gemini structured output (JSON schema) plus a defensive parser | No broken JSON, no truncated packs |
| Always exactly 7 scenes | 4 to 8 parts, sized to the chapter | Short chapters were padded, long ones squeezed |
| Story chapters only | **Story** chapters get scenes, characters and feelings; **non-story** chapters (science, maths, civics) get key ideas | Most school chapters aren't stories |
| Book evidence trusted | Every quote is **checked against the chapter text**: "Found in the book" or "Check this quote" | Catches invented quotes, the worst failure for a study tool |
| Every answer 3-sentence P.E.E. | P.E.E. as a guide for theory answers, **sized to marks** (CBSE/ICSE conventions); maths and science use Given / To find / Solution steps | Answers match what the school expects |
| 6 open mock questions | 6 to 10 practice questions in Indian exam types (MCQ with options, short, long, HOTS, competency), easy / medium / hard, with skill tested | Matches real school papers |
| Two calls in a row | Two calls in parallel | Half the wait |
| Answer refiner, lost on refresh | Refine with undo; refined answers **saved** into the pack and into the PDF | The parent's edits are the point of reviewing |
| Downloaded .html to print | Print button (all sections expanded) and server PDF, saved in My Documents | One click, works on phones |
| Narration via any voice | Read-aloud prefers an Indian English voice, with pause and speed | Sounds familiar to the child |
| For children aged 8-14 using it | For parents and tutors (18+) **using it with** the child | Syllabi is adults-only (Gemini terms) |

## The rules every pack follows (in the prompt)

1. **The chapter is the only source.** Answers, scenes and explanations describe only
   what the chapter says. No outside facts, motives or consequences. Word meanings may
   be explained simply. Handwritten notes on pages are not facts.
2. **Keep the book's language.** Use the chapter's own words, names, dates and terms;
   the book's language is the lesson. Answer in the chapter's language.
3. **Context accuracy.** A word means what it means in the chapter (StoryLearner's
   "vote" is "approval", not "election").
4. **Cause before consequence.** For "what/why/how did X happen", include the minimum
   lead-up needed, in the book's order.
5. **All instances.** If several moments answer a question, give each, in order.
6. **Mirror the question** where it reads naturally ("Jimmy was not popular because...").
7. **No repetition.** Every sentence adds something new.
8. **Size to marks.** 1 mark = a word or line; 2 = 20-40 words; 3 = 50-80; 5 = 100-150.
9. **Evidence is copied exactly** (at most 40 words) from the chapter text, so it can be
   checked.

## Output

- **Overview:** title, subject, kind (story or information), setting or summary,
  themes or big ideas, characters (story only).
- **Walkthrough (4-8 parts):** title, what happens / what it says, why it matters,
  feelings (story only), 3-5 words from the book with simple meanings, a read-aloud
  script (5-7 warm sentences, plain text).
- **Textbook questions:** every end-of-chapter question, with its number and wording
  kept, a hint, the evidence quote (checked), a model answer and a spoken walkthrough.
  If the chapter has no exercise, 5 comprehension questions.
- **Practice test:** 6-10 questions, easy to hard, with type, marks, skill tested,
  options for MCQs, a model answer and a walkthrough. Self-marking and a score.
- **Glossary:** every vocabulary word from the walkthrough, alphabetical.

## Later (not built yet)

- Hide answers until a timer runs out ("test mode").
- One pack across several chapters.
- Teacher-written answers replacing the model answer entirely (refine covers most needs).
