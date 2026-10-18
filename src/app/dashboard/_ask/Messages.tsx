import { Alert } from "@/components/ui";

/** Why Generate is held back, and any error or warning from the last try. Not printed. */
export function Messages({ blocked, error, notice }: { blocked: string | null; error: string | null; notice: string | null }) {
  return (
    <>
      {blocked && (
        <p id="generate-blocked" className="text-sm text-slate-600 print:hidden">
          {blocked}
        </p>
      )}
      {error && (
        <Alert tone="error" className="print:hidden">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="warning" className="print:hidden">
          {notice}
        </Alert>
      )}
    </>
  );
}
