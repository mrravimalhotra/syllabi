import { unzipSync, strFromU8 } from "fflate";

// Word worksheets (.docx) are zipped XML, so their text can be read directly in
// the browser: no page images and no AI page-reading step. Tables become
// "cell | cell" rows so question tables and timelines keep their shape.
// Embedded pictures and diagrams are not included.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Target size of one text "page" sent for indexing (characters). */
const PAGE_CHARS = 3000;

function paragraphText(p: Element): string {
  let text = "";
  for (const node of Array.from(p.getElementsByTagNameNS(W, "*"))) {
    if (node.localName === "t") text += node.textContent ?? "";
    else if (node.localName === "tab") text += "\t";
    else if (node.localName === "br" || node.localName === "cr") text += "\n";
  }
  return text.trim();
}

function blockText(el: Element): string[] {
  if (el.localName === "p") {
    const t = paragraphText(el);
    return t ? [t] : [];
  }
  if (el.localName === "tbl") {
    return Array.from(el.getElementsByTagNameNS(W, "tr")).map((row) =>
      Array.from(row.getElementsByTagNameNS(W, "tc"))
        .map((cell) => Array.from(cell.getElementsByTagNameNS(W, "p")).map(paragraphText).join(" "))
        .join(" | ")
    );
  }
  return [];
}

/** Extracts a .docx file's text as page-sized chunks, split at paragraph boundaries. */
export async function docxToTextPages(file: File): Promise<string[]> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (f) => f.name === "word/document.xml",
  });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error(`${file.name} doesn't look like a Word (.docx) file.`);

  const doc = new DOMParser().parseFromString(strFromU8(xml), "application/xml");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error(`Couldn't read ${file.name}.`);

  const lines = Array.from(body.children).flatMap(blockText);
  if (lines.length === 0) throw new Error(`${file.name} has no text to read.`);

  const pages: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 2 > PAGE_CHARS) {
      pages.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${line}` : line;
  }
  if (current) pages.push(current);
  return pages;
}
