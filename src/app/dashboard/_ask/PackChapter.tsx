"use client";

import Link from "next/link";
import type { Book } from "@/app/dashboard/_ask/constants";
import { cx, input, link } from "@/components/ui";

interface Props {
  books: Book[];
  /** The chosen book's id; "" means none. */
  value: string;
  onChange: (bookId: string) => void;
  /** Pages attached below: when there are any, the pack is made from them, not the book. */
  attachedPages: number;
}

/** Study packs: which chapter (a book from My books) to make the pack from. */
export function PackChapter({ books, value, onChange, attachedPages }: Props) {
  const book = books.find((b) => b.id === value);
  return (
    <div className="space-y-2 border-b border-slate-100 px-4 pt-4 pb-3 sm:px-5">
      <label htmlFor="pack-book" className="text-sm font-medium text-slate-900">
        Which chapter?
      </label>
      {books.length > 0 ? (
        <select id="pack-book" value={value} onChange={(e) => onChange(e.target.value)} className={cx(input, "max-w-xl")}>
          <option value="">{attachedPages > 0 ? "No book: use the pages I attached" : "Choose a book, or attach pages below"}</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
              {b.subject || b.grade ? ` (${[b.subject, b.grade].filter(Boolean).join(", ")})` : ""}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-slate-500">
          Attach the chapter&apos;s pages below, or add it to{" "}
          <Link href="/dashboard/library" className={link}>
            My books
          </Link>{" "}
          first (best for long chapters: it&apos;s read once and quotes can be checked).
        </p>
      )}
      {attachedPages > 0 && (
        <p className="text-sm font-medium text-sky-800">
          The pack will be made from your {attachedPages} attached page{attachedPages === 1 ? "" : "s"}
          {book ? `, not from “${book.title}”. Remove the attachments to use the book.` : "."}
        </p>
      )}
      {attachedPages === 0 && book && <p className="text-sm font-medium text-sky-800">The pack will be made from “{book.title}”.</p>}
      <p className="text-xs text-slate-500">
        Makes a walkthrough with read-aloud, answers to every textbook question, a practice test and a glossary. Takes one to three minutes.
      </p>
    </div>
  );
}
