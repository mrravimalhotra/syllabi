import { sourceLabel, taskLabel } from "@/lib/format";
import path from "node:path";
import { Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { tidyMath } from "@/lib/tidy-math";
import type { CompletionImage } from "@/lib/llm/types";
import type { GenerationTaskType, MatchedChunk } from "@/types/database";

// Embedded Noto fonts (SIL OFL, see fonts/OFL.txt). The built-in PDF fonts
// (Helvetica) have no √ ≤ ∫ ₹ and no Devanagari, so math and Hindi came out
// blank. Each glyph falls back through this list: Latin/Greek → math → Hindi.
// next.config.ts ships the font files with the generation routes.
const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");
Font.register({
  family: "NotoSans",
  fonts: [
    { src: path.join(FONT_DIR, "NotoSans-Regular.ttf") },
    { src: path.join(FONT_DIR, "NotoSans-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.register({ family: "NotoSansMath", src: path.join(FONT_DIR, "NotoSansMath-Regular.ttf") });
Font.register({
  family: "NotoSansDevanagari",
  fonts: [
    { src: path.join(FONT_DIR, "NotoSansDevanagari-Regular.ttf") },
    { src: path.join(FONT_DIR, "NotoSansDevanagari-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.register({ family: "NotoSansMono", src: path.join(FONT_DIR, "NotoSansMono-Regular.ttf") });
// Don't hyphenate: the default English rules split words (and formulas) oddly.
Font.registerHyphenationCallback((word) => [word]);

const FONT_FAMILY = ["NotoSans", "NotoSansMath", "NotoSansDevanagari"];
const CODE_FONT_FAMILY = ["NotoSansMono", ...FONT_FAMILY];

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 50, paddingHorizontal: 44, fontSize: 11, fontFamily: FONT_FAMILY },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#64748b", marginBottom: 16 },
  h1: { fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  h2: { fontSize: 12.5, fontWeight: 700, marginTop: 10, marginBottom: 4 },
  h3: { fontSize: 11.5, fontWeight: 700, marginTop: 8, marginBottom: 3 },
  bold: { fontWeight: 700 },
  // Line height is set per block, not on the page: a page-level lineHeight
  // makes react-pdf silently drop the absolutely positioned footer.
  paragraph: { marginBottom: 6, lineHeight: 1.5 },
  listItem: { flexDirection: "row", marginBottom: 3, lineHeight: 1.5 },
  listMarker: { width: 18 },
  listText: { flex: 1 },
  codeBlock: {
    marginVertical: 6,
    padding: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 3,
  },
  codeLine: { fontFamily: CODE_FONT_FAMILY, fontSize: 9, lineHeight: 1.4 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 8 },
  table: { marginVertical: 6, borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#cbd5e1" },
  tableRow: { flexDirection: "row" },
  tableCell: { flex: 1, padding: 4, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#cbd5e1", fontSize: 10, lineHeight: 1.4 },
  tableHeader: { backgroundColor: "#f1f5f9", fontWeight: 700 },
  quote: {
    borderLeftWidth: 3,
    borderColor: "#a5b4fc",
    backgroundColor: "#eef2ff",
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
    fontSize: 10,
    lineHeight: 1.5,
  },
    sourcesTitle: { fontSize: 11, fontWeight: 700, marginTop: 18, marginBottom: 6 },
  source: { fontSize: 9, color: "#475569", marginBottom: 3 },
  sourceBlock: { marginBottom: 8 },
  sourceImage: { width: 240, marginTop: 4, marginBottom: 2, borderRadius: 2 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
  },
});

const ANSWER_KEY_HEADING = /^(?:answer key\b|उत्तर कुंजी|उत्तरसूची|उत्तर सूची|corrigé)/i;

/** Renders one line of text with **bold** spans; other inline markdown (`code`, *italic*) is shown as plain text. */
function InlineText({ text }: { text: string }) {
  const clean = tidyMath(text)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2")
    // [text](https://...) prints as "text (https://...)"
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    // U+2028 (line separator) is a line break inside one block, e.g. a worksheet question and its answer line.
    .replace(/\u2028/g, "\n");
  const parts = clean.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <Text key={i} style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

function splitTableRow(line: string): string[] {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** One block read from the Markdown: what to draw, and the index of the line to carry on from. */
interface Read {
  node: React.ReactNode;
  next: number;
}

/** A ``` code block, from the opening fence to the closing one (or the end). */
function readCode(lines: string[], start: number): Read {
  const code: string[] = [];
  let i = start + 1;
  while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
  const node = (
    <View key={i} style={styles.codeBlock}>
      {code.map((codeLine, c) => (
        <Text key={c} style={styles.codeLine}>
          {/* Keep indentation: leading spaces/tabs become non-breaking spaces. */}
          {codeLine.replace(/\t/g, "  ").replace(/^ +/, (spaces) => "\u00a0".repeat(spaces.length)) || "\u00a0"}
        </Text>
      ))}
    </View>
  );
  return { node, next: i + 1 };
}

/** A table: the run of lines starting with "|" (the separator row is skipped). */
function readTable(lines: string[], start: number): Read {
  const rows: string[][] = [];
  let i = start;
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    const row = lines[i].trim();
    if (!/^\|?\s*:?-{2,}/.test(row)) rows.push(splitTableRow(row));
    i++;
  }
  const node = (
    <View key={i - 1} style={styles.table} wrap={false}>
      {rows.map((cells, r) => (
        <View key={r} style={styles.tableRow}>
          {cells.map((cell, c) => (
            <View key={c} style={r === 0 ? [styles.tableCell, styles.tableHeader] : styles.tableCell}>
              <InlineText text={cell} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
  return { node, next: i };
}

function readHeading(line: string, index: number, heading: RegExpExecArray): Read {
  const level = heading[1].length;
  const style = level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
  const headingText = tidyMath(heading[2].replace(/\*\*/g, ""));
  return {
    node: (
      // A sample paper's answer key starts on a new page, so the paper prints on its own.
      <Text key={index} style={style} minPresenceAhead={40} break={ANSWER_KEY_HEADING.test(headingText)}>
        {headingText}
      </Text>
    ),
    next: index + 1,
  };
}

/** A quote: the run of lines starting with ">". */
function readQuote(lines: string[], start: number): Read {
  const quote: string[] = [];
  let i = start;
  while (i < lines.length && lines[i].trim().startsWith(">")) quote.push(lines[i++].trim().replace(/^>\s?/, ""));
  return {
    node: (
      <View key={i - 1} style={styles.quote} wrap={false}>
        <InlineText text={quote.join(" ")} />
      </View>
    ),
    next: i,
  };
}

/** A bullet or numbered item, indented by how far the line is indented; null for any other line. */
function readListItem(raw: string, line: string, index: number): Read | null {
  const indent = Math.min(Math.floor((raw.length - raw.trimStart().length) / 2), 3) * 14;
  // [^] rather than ".": an item may hold a U+2028 line break, which "." doesn't match.
  const bullet = /^[-*•]\s+([^]*)$/.exec(line);
  const numbered = /^(\d+|[a-zA-Z])[.)]\s+([^]*)$/.exec(line);
  if (!bullet && !numbered) return null;
  return {
    node: (
      <View key={index} style={[styles.listItem, { paddingLeft: 6 + indent }]} wrap={false}>
        <Text style={styles.listMarker}>{bullet ? "•" : `${numbered![1]}.`}</Text>
        <View style={styles.listText}>
          <InlineText text={bullet ? bullet[1] : numbered![2]} />
        </View>
      </View>
    ),
    next: index + 1,
  };
}

/** The block that starts at line `i`. */
function readBlock(lines: string[], i: number): Read {
  const raw = lines[i];
  const line = raw.trim();
  if (line.startsWith("```")) return readCode(lines, i);
  if (line.startsWith("|")) return readTable(lines, i);
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) return readHeading(line, i, heading);
  if (line.startsWith(">")) return readQuote(lines, i);
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return { node: <View key={i} style={styles.rule} />, next: i + 1 };
  const item = readListItem(raw, line, i);
  if (item) return item;
  return {
    node: (
      <View key={i} style={styles.paragraph}>
        <InlineText text={line} />
      </View>
    ),
    next: i + 1,
  };
}

/**
 * Markdown renderer for the subset the prompts ask for: headings (#, ##, ###),
 * bullet and numbered lists (indented for nesting), tables, ``` code blocks,
 * quotes (>), horizontal rules, paragraphs, and bold.
 */
export function ContentBody({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; ) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }
    const { node, next } = readBlock(lines, i);
    blocks.push(node);
    i = next;
  }
  return <>{blocks}</>;
}


export interface RenderPdfInput {
  taskType: GenerationTaskType;
  title: string;
  preparedBy: string;
  content: string;
  sources: MatchedChunk[];
  /** Source image_path → loaded image, so diagrams/maps a source cites get embedded, not just referenced by name. */
  sourceImages: Map<string, CompletionImage>;
  /** The answer used Google Search; the PDF says so. */
  usedSearchGrounding?: boolean;
  /** Overrides the kind shown under the title (e.g. "Practice worksheet"). */
  label?: string;
  /** Overrides the footer line (made by code, not AI). */
  footer?: string;
}

export async function renderGenerationPdf(input: RenderPdfInput): Promise<Buffer> {
  const doc = (
    <Document title={input.title} author="Syllabi">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{input.title}</Text>
        <Text style={styles.subtitle}>
          {input.label ?? taskLabel(input.taskType)} · Prepared by {input.preparedBy} · Syllabi
        </Text>

        <ContentBody text={input.content} />

        {input.usedSearchGrounding && (
          <Text style={styles.source}>
            Parts of this answer used Google Search because the uploaded books didn&apos;t fully cover it.
          </Text>
        )}

        {input.sources.length > 0 && (
          <>
            <Text style={styles.sourcesTitle} minPresenceAhead={60}>
              Sources
            </Text>
            {input.sources.map((s, i) => {
              const image = s.image_path ? input.sourceImages.get(s.image_path) : undefined;
              return (
                <View key={s.id} style={styles.sourceBlock} wrap={false}>
                  <Text style={styles.source}>
                    [{i + 1}] {sourceLabel(s)}
                  </Text>
                  {image && (
                    // eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's Image (no alt concept), not an HTML img
                    <Image style={styles.sourceImage} src={`data:${image.mimeType};base64,${image.data}`} />
                  )}
                </View>
              );
            })}
          </>
        )}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${input.footer ?? "AI-generated by Syllabi for a parent or tutor. Check before use."} · Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
