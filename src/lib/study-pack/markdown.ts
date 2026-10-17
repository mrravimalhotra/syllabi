import type { PackQuestion, StudyPack } from "@/lib/study-pack/types";

// Headings and labels in the pack's own language, so a Hindi pack prints in Hindi.
const LABELS = {
  en: { from: "From", themes: "Themes", ideas: "Big ideas", characters: "Characters", story: "The story, part by part", keyIdeas: "Key ideas", why: "Why it matters", feelings: "Feelings", textbook: "Textbook questions", comprehension: "Comprehension questions", practice: "Practice test", glossary: "Glossary", hint: "Hint", answer: "Answer", check: "check this quote against the book", skill: "Skill tested", marks: "marks", mark: "mark" },
  hi: { from: "स्रोत", themes: "विषय-वस्तु", ideas: "मुख्य विचार", characters: "पात्र", story: "कहानी, भाग-दर-भाग", keyIdeas: "मुख्य बातें", why: "यह क्यों महत्वपूर्ण है", feelings: "भावनाएँ", textbook: "पाठ्यपुस्तक के प्रश्न", comprehension: "बोध प्रश्न", practice: "अभ्यास परीक्षा", glossary: "शब्दकोश", hint: "संकेत", answer: "उत्तर", check: "इस उद्धरण को पुस्तक से मिलाएँ", skill: "जाँचा गया कौशल", marks: "अंक", mark: "अंक" },
  mr: { from: "स्रोत", themes: "आशय", ideas: "मुख्य कल्पना", characters: "पात्रे", story: "कथा, भागानुसार", keyIdeas: "मुख्य मुद्दे", why: "हे का महत्त्वाचे आहे", feelings: "भावना", textbook: "पाठ्यपुस्तकातील प्रश्न", comprehension: "आकलन प्रश्न", practice: "सराव चाचणी", glossary: "शब्दार्थ", hint: "संकेत", answer: "उत्तर", check: "हा उतारा पुस्तकाशी पडताळून पाहा", skill: "तपासलेले कौशल्य", marks: "गुण", mark: "गुण" },
  fr: { from: "Source", themes: "Thèmes", ideas: "Idées clés", characters: "Personnages", story: "L'histoire, partie par partie", keyIdeas: "Idées clés", why: "Pourquoi c'est important", feelings: "Sentiments", textbook: "Questions du manuel", comprehension: "Questions de compréhension", practice: "Test d'entraînement", glossary: "Glossaire", hint: "Indice", answer: "Réponse", check: "vérifiez cette citation dans le livre", skill: "Compétence évaluée", marks: "points", mark: "point" },
};
type Labels = (typeof LABELS)["en"];

function questionMarkdown(q: PackQuestion, label: string, l: Labels): string {
  const meta = [q.type, q.marks ? `${q.marks} ${q.marks > 1 ? l.marks : l.mark}` : "", q.difficulty ?? ""]
    .filter(Boolean)
    .join(" · ");
  const lines = [`### ${label} ${q.question}`];
  if (meta) lines.push(`*${meta}*`);
  if (q.options.length) lines.push(q.options.map((o) => `- ${o}`).join("\n"));
  if (q.hint) lines.push(`**${l.hint}:** ${q.hint}`);
  if (q.evidence) {
    const check = q.evidenceFound === false ? ` *(${l.check})*` : "";
    lines.push(`> "${q.evidence}"${check}`);
  }
  lines.push(`**${l.answer}:** ${q.answer}`);
  if (q.skill) lines.push(`*${l.skill}: ${q.skill}*`);
  return lines.join("\n\n");
}

/** The whole pack as Markdown: saved as the answer's text, so the PDF, Copy and older screens all work. */
export function packToMarkdown(pack: StudyPack): string {
  const l: Labels = LABELS[pack.language as keyof typeof LABELS] ?? LABELS.en;
  const out: string[] = [];
  out.push(`**${l.from}:** ${pack.source}${pack.subject ? ` · ${pack.subject}` : ""}`);
  if (pack.overview) out.push(pack.overview);
  if (pack.themes.length) out.push(`**${pack.kind === "story" ? l.themes : l.ideas}:** ${pack.themes.join(", ")}`);
  if (pack.characters.length) {
    out.push(`**${l.characters}:**\n\n${pack.characters.map((c) => `- **${c.name}**: ${c.role}`).join("\n")}`);
  }

  if (pack.walkthrough.length) {
    out.push(`# ${pack.kind === "story" ? l.story : l.keyIdeas}`);
    pack.walkthrough.forEach((p, i) => {
      const block = [`## ${i + 1}. ${p.title}`, p.summary, `**${l.why}:** ${p.whyItMatters}`];
      if (p.feelings) block.push(`**${l.feelings}:** ${p.feelings}`);
      if (p.vocabulary.length) block.push(p.vocabulary.map((v) => `- **${v.word}**: ${v.meaning}`).join("\n"));
      out.push(block.join("\n\n"));
    });
  }

  if (pack.textbookQuestions.length) {
    out.push(`# ${pack.textbookQuestionsWritten ? l.comprehension : l.textbook}`);
    pack.textbookQuestions.forEach((q, i) => out.push(questionMarkdown(q, q.number || `Q${i + 1}.`, l)));
  }

  if (pack.practiceQuestions.length) {
    out.push(`# ${l.practice}`);
    pack.practiceQuestions.forEach((q, i) => out.push(questionMarkdown(q, `P${i + 1}.`, l)));
  }

  if (pack.glossary.length) {
    out.push(`# ${l.glossary}\n\n${pack.glossary.map((v) => `- **${v.word}**: ${v.meaning}`).join("\n")}`);
  }
  return out.join("\n\n");
}
