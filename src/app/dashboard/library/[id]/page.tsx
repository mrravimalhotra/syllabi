"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BookIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import { Alert, Badge, EmptyState, Skeleton, button, card, cx, input } from "@/components/ui";
import { LOW_SCORE, MEDIUM_SCORE } from "@/lib/ingestion/confidence";

interface PageView {
  number: number;
  text: string;
  imageUrl: string | null;
  score: number | null;
  issues: string[];
}

interface BookPages {
  title: string;
  pages: { number: number; score: number | null }[];
  page: PageView | null;
}

const tone = (score: number) => (score >= MEDIUM_SCORE ? "success" : score >= LOW_SCORE ? "warning" : "danger");

/** One book's saved pages, one at a time: the page picture beside the text Syllabi read from it, and its scan score. */
export default function BookPagesPage() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<BookPages | null>(null);
  const [wanted, setWanted] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the spinner while the chosen page loads
    setLoading(true);
    fetch(`/api/library/${id}/pages${wanted === null ? "" : `?page=${wanted}`}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!current) return;
        if (r.status === 404) return setMissing(true);
        if (!r.ok) throw new Error(data.error ?? failedRequestMessage(r.status, "load this page"));
        setError(null);
        setBook(data as BookPages);
      })
      .catch((err) => {
        if (current) setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error && err.message ? err.message : "Couldn't load this page. Try again.");
      })
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [id, wanted]);

  const numbers = book?.pages.map((p) => p.number) ?? [];
  const at = book?.page ? numbers.indexOf(book.page.number) : -1;
  const go = (index: number) => setWanted(numbers[index]);

  return (
    <div className="space-y-4">
      <Link href="/dashboard/library" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ChevronLeftIcon className="h-4 w-4" /> My books
      </Link>

      {error && <Alert tone="error">{error}</Alert>}

      {missing && (
        <EmptyState
          icon={<BookIcon className="h-6 w-6" />}
          title="Book not found"
          description="It doesn't exist or was deleted."
          action={
            <Link href="/dashboard/library" className={button.secondary}>
              Back to My books
            </Link>
          }
        />
      )}

      {!book && !error && !missing && (
        <div className={cx(card, "space-y-3 p-6")} role="status" aria-label="Loading">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {book && (
        <>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{book.title}</h1>
            <p className="text-sm text-slate-500">What Syllabi read from each page. Answers come from this text, so a page with missing words is worth scanning again.</p>
          </div>

          {!book.page ? (
            <EmptyState icon={<BookIcon className="h-6 w-6" />} title="No pages saved yet" description="Pages appear here once they have been read." />
          ) : (
            <>
              <nav className="flex flex-wrap items-center gap-2" aria-label="Pages">
                <button type="button" className={button.secondary} onClick={() => go(at - 1)} disabled={at <= 0 || loading}>
                  <ChevronLeftIcon className="h-4 w-4" /> Previous
                </button>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="sr-only">Page</span>
                  <select className={cx(input, "w-auto")} value={book.page.number} onChange={(e) => setWanted(Number(e.target.value))} disabled={loading}>
                    {book.pages.map((p) => (
                      <option key={p.number} value={p.number}>
                        Page {p.number}
                        {p.score !== null && p.score < LOW_SCORE ? " (hard to read)" : ""}
                      </option>
                    ))}
                  </select>
                  <span>of {numbers.length}</span>
                </label>
                <button type="button" className={button.secondary} onClick={() => go(at + 1)} disabled={at >= numbers.length - 1 || loading}>
                  Next <ChevronRightIcon className="h-4 w-4" />
                </button>
              </nav>

              <PageDetails page={book.page} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function PageDetails({ page }: { page: PageView }) {
  return (
    <section className={cx(card, "space-y-3 p-4")} aria-label={`Page ${page.number}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">Page {page.number}</h2>
        {page.score !== null && <Badge tone={tone(page.score)}>Scan quality {page.score}%</Badge>}
        {page.issues.length > 0 && <span className="text-xs text-slate-500">{page.issues.join("; ")}</span>}
      </div>
      <div className={cx("grid gap-4", page.imageUrl && "md:grid-cols-2")}>
        {page.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to the page picture
          <img src={page.imageUrl} alt={`Picture of page ${page.number}`} className="w-full rounded-xl border border-slate-200" />
        )}
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Text Syllabi read</p>
          {page.text.trim() ? (
            <pre className="max-h-[70vh] overflow-auto rounded-xl bg-slate-50 p-3 font-sans text-sm whitespace-pre-wrap text-slate-800">{page.text}</pre>
          ) : (
            <p className="text-sm text-amber-700">No text was saved for this page.</p>
          )}
        </div>
      </div>
    </section>
  );
}
