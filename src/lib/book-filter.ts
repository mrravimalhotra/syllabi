// Narrowing a long list of books by class, subject and chapter (the Solve screen's filters). The labels are typed by
// the person, so "Class 7", "class 7 " and "CLASS 7" are the same class. A choice that no book has any more (a book
// was deleted or renamed) is dropped rather than leaving an empty list.

export interface BookFilter {
  /** "" means any. */
  grade: string;
  subject: string;
  chapter: string;
}

export interface FilterableBook {
  grade: string | null;
  subject: string | null;
  chapter?: string | null;
}

export const ANY_BOOK: BookFilter = { grade: "", subject: "", chapter: "" };

const FIELDS = ["grade", "subject", "chapter"] as const;
type Field = (typeof FIELDS)[number];

/** The same label however it was typed: case, spaces. */
const labelKey = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function isBookFilter(value: unknown): value is BookFilter {
  return typeof value === "object" && value !== null && FIELDS.every((f) => typeof (value as Record<string, unknown>)[f] === "string");
}

const matchesUpTo = (book: FilterableBook, filter: BookFilter, upTo: number) =>
  FIELDS.slice(0, upTo).every((f) => !filter[f] || labelKey(book[f]) === labelKey(filter[f]));

/** The labels the books have for one field, among the books that match the fields before it, each once, in natural order. */
function labels(books: FilterableBook[], filter: BookFilter, field: Field): string[] {
  const seen = new Map<string, string>();
  for (const book of books) {
    if (!matchesUpTo(book, filter, FIELDS.indexOf(field))) continue;
    const key = labelKey(book[field]);
    if (key && !seen.has(key)) seen.set(key, (book[field] ?? "").trim().replace(/\s+/g, " "));
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

/** The filter with any choice no book has (given the choices before it) dropped. */
export function effectiveFilter(books: FilterableBook[], filter: BookFilter): BookFilter {
  const result = { ...ANY_BOOK };
  for (const field of FIELDS) {
    const wanted = labelKey(filter[field]);
    if (wanted && labels(books, result, field).some((l) => labelKey(l) === wanted)) result[field] = filter[field];
  }
  return result;
}

/** The choices to offer for each field, given the ones already made. */
export function filterOptions(books: FilterableBook[], filter: BookFilter): Record<Field, string[]> {
  const f = effectiveFilter(books, filter);
  return { grade: labels(books, f, "grade"), subject: labels(books, f, "subject"), chapter: labels(books, f, "chapter") };
}

/** The books the filter lets through. */
export function matchingBooks<T extends FilterableBook>(books: T[], filter: BookFilter): T[] {
  const f = effectiveFilter(books, filter);
  return books.filter((b) => matchesUpTo(b, f, FIELDS.length));
}
