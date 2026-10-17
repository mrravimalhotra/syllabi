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
  study_pack: "Study pack",
};

// A sample paper's answer key starts at a "## Answer Key" heading.
const ANSWER_KEY_START = /^#{1,3}\s*\**answer key\b/im;

export function hasAnswerKey(text: string): boolean {
  return ANSWER_KEY_START.test(text);
}

/** The paper without its answer key, for the child to attempt. */
export function withoutAnswerKey(text: string): string {
  const match = ANSWER_KEY_START.exec(text);
  return match ? text.slice(0, match.index).trimEnd() : text;
}
