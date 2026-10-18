/** One labelled line of the account page. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4 text-sm sm:flex-row sm:items-center sm:gap-6 sm:px-6">
      <p className="w-36 shrink-0 text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}
