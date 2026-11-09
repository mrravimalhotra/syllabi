"use client";

import type { BookValues } from "@/app/dashboard/library/_parts/AddBookForm";
import { Field, input } from "@/components/ui";

/** The title, subject, class and chapter of the book. */
export function BookDetails({ values, onChange }: { values: BookValues; onChange: (patch: Partial<BookValues>) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Title" htmlFor="book-title">
          <input
            id="book-title"
            value={values.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g. Science Class 8, Chapter 3: Motion"
            maxLength={200}
            className={input}
          />
        </Field>
      </div>
      <Field label="Subject (optional)" htmlFor="book-subject">
        <input
          id="book-subject"
          value={values.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          placeholder="e.g. Science"
          maxLength={100}
          className={input}
        />
      </Field>
      <Field label="Class (optional)" htmlFor="book-grade">
        <input
          id="book-grade"
          value={values.grade}
          onChange={(e) => onChange({ grade: e.target.value })}
          placeholder="e.g. Class 8"
          maxLength={50}
          className={input}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Chapter (optional)" htmlFor="book-chapter" hint="Give a chapter's textbook and exercises the same chapter, so Solve can pick them together.">
          <input
            id="book-chapter"
            value={values.chapter}
            onChange={(e) => onChange({ chapter: e.target.value })}
            placeholder="e.g. Unit 2 Lithosphere"
            maxLength={150}
            className={input}
          />
        </Field>
      </div>
    </div>
  );
}
