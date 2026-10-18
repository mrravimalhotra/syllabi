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

/** Display names for the kinds of saved document. */
const TASK_LABELS: Record<string, string> = {
  solution: "Step-by-step solution",
  notes: "Revision notes",
  sample_paper: "Sample paper",
  ad_hoc: "Quick answer",
  study_pack: "Study pack",
};

/** A kind of document in words; never a raw code like "sample_paper". */
export function taskLabel(taskType: string): string {
  return TASK_LABELS[taskType] ?? taskType.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** The kinds of material a book page can be, as shown to people. */
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  textbook: "Textbook",
  exercise: "Exercise",
  past_paper: "Past paper",
  notes: "Notes",
};

export function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// A sample paper's answer key starts at a "## Answer Key" heading.
const ANSWER_KEY_START = /^#{1,3}\s*\**(?:answer key\b|उत्तर कुंजी|उत्तरसूची|उत्तर सूची|corrigé)/im;

export function hasAnswerKey(text: string): boolean {
  return ANSWER_KEY_START.test(text);
}

/** The paper without its answer key, for the child to attempt. */
export function withoutAnswerKey(text: string): string {
  const match = ANSWER_KEY_START.exec(text);
  return match ? text.slice(0, match.index).trimEnd() : text;
}

/** "Heading, p.4" for a cited source; a heading that is just "Page 9" isn't repeated as "Page 9, p.9". */
export function sourceLabel(s: { section_label: string | null; source_type: string; page_number: number | null }): string {
  const heading = s.section_label?.trim() ?? "";
  const generic = /^page\s*\d+$/i.test(heading);
  const name = heading && !generic ? heading : "";
  if (name) return s.page_number ? `${name}, p.${s.page_number}` : name;
  if (s.page_number) return `${sourceTypeLabel(s.source_type)}, p.${s.page_number}`;
  return sourceTypeLabel(s.source_type);
}
