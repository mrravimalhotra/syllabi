// One date format everywhere on screen: dd-mm-yyyy, in India time.
const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso)).replace(/\//g, "-");
}

/** Display names for the four kinds of answer. */
export const TASK_LABELS: Record<string, string> = {
  solution: "Step-by-step solution",
  notes: "Revision notes",
  sample_paper: "Sample paper",
  ad_hoc: "Ask anything",
};
