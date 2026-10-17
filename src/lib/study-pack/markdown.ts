import type { PackQuestion, StudyPack } from "@/lib/study-pack/types";

function questionMarkdown(q: PackQuestion, label: string): string {
  const meta = [q.type, q.marks ? `${q.marks} mark${q.marks > 1 ? "s" : ""}` : "", q.difficulty ?? ""]
    .filter(Boolean)
    .join(" · ");
  const lines = [`### ${label} ${q.question}`];
  if (meta) lines.push(`*${meta}*`);
  if (q.options.length) lines.push(q.options.map((o) => `- ${o}`).join("\n"));
  if (q.hint) lines.push(`**Hint:** ${q.hint}`);
  if (q.evidence) {
    const check = q.evidenceFound === false ? " *(check this quote against the book)*" : "";
    lines.push(`> "${q.evidence}"${check}`);
  }
  lines.push(`**Answer:** ${q.answer}`);
  if (q.skill) lines.push(`*Skill tested: ${q.skill}*`);
  return lines.join("\n\n");
}

/** The whole pack as Markdown: saved as the answer's text, so the PDF, Copy and older screens all work. */
export function packToMarkdown(pack: StudyPack): string {
  const out: string[] = [];
  out.push(`**From:** ${pack.source}${pack.subject ? ` · ${pack.subject}` : ""}`);
  if (pack.overview) out.push(pack.overview);
  if (pack.themes.length) out.push(`**${pack.kind === "story" ? "Themes" : "Big ideas"}:** ${pack.themes.join(", ")}`);
  if (pack.characters.length) {
    out.push(`**Characters:**\n\n${pack.characters.map((c) => `- **${c.name}**: ${c.role}`).join("\n")}`);
  }

  if (pack.walkthrough.length) {
    out.push(`# ${pack.kind === "story" ? "The story, part by part" : "Key ideas"}`);
    pack.walkthrough.forEach((p, i) => {
      const block = [`## ${i + 1}. ${p.title}`, p.summary, `**Why it matters:** ${p.whyItMatters}`];
      if (p.feelings) block.push(`**Feelings:** ${p.feelings}`);
      if (p.vocabulary.length) block.push(p.vocabulary.map((v) => `- **${v.word}**: ${v.meaning}`).join("\n"));
      out.push(block.join("\n\n"));
    });
  }

  if (pack.textbookQuestions.length) {
    out.push(`# ${pack.textbookQuestionsWritten ? "Comprehension questions" : "Textbook questions"}`);
    pack.textbookQuestions.forEach((q, i) => out.push(questionMarkdown(q, q.number || `Q${i + 1}.`)));
  }

  if (pack.practiceQuestions.length) {
    out.push("# Practice test");
    pack.practiceQuestions.forEach((q, i) => out.push(questionMarkdown(q, `P${i + 1}.`)));
  }

  if (pack.glossary.length) {
    out.push(`# Glossary\n\n${pack.glossary.map((v) => `- **${v.word}**: ${v.meaning}`).join("\n")}`);
  }
  return out.join("\n\n");
}
