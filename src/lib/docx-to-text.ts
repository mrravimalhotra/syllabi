import { unzipSync, strFromU8 } from "fflate";
import { downscaleImageFile } from "@/lib/downscale-image";

// Word worksheets (.docx) are zipped XML, so their text can be read directly in
// the browser: no AI page-reading step. Tables become "cell | cell" rows so
// question tables keep their shape. Pictures matter too: in real maths
// worksheets the measures to construct or the figure to use are often only in
// a picture. Each picture is marked "[Picture N]" in the text and returned as
// an image with a hint saying what it follows, so the AI can read it in place.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";

/** Target size of one text "page" sent for indexing (characters). */
const PAGE_CHARS = 3000;
/** Images browsers can decode; Word's old EMF/WMF drawings can't be shown. */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

export interface DocxPicture {
  imageBase64: string;
  mimeType: string;
  /** Where the picture sits, e.g. "Picture 2, after: Q1. Draw line segments for the following measures:". */
  hint: string;
}

export interface DocxContent {
  /** Text in page-sized parts, with "[Picture N]" where each picture was. */
  textPages: string[];
  pictures: DocxPicture[];
  /** Pictures in formats that can't be read (e.g. EMF), by number. */
  skippedPictures: number[];
}

/** Reads a .docx file's text and pictures in document order. */
export async function readDocx(file: File): Promise<DocxContent> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (f) => f.name === "word/document.xml" || f.name === "word/_rels/document.xml.rels" || f.name.startsWith("word/media/"),
  });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error(`${file.name} doesn't look like a Word (.docx) file.`);

  // Relationship id (rId7) -> media path (word/media/image3.png).
  const targets = new Map<string, string>();
  const relsXml = files["word/_rels/document.xml.rels"];
  if (relsXml) {
    const rels = new DOMParser().parseFromString(strFromU8(relsXml), "application/xml");
    for (const rel of Array.from(rels.getElementsByTagNameNS(REL, "Relationship"))) {
      const target = rel.getAttribute("Target") ?? "";
      targets.set(rel.getAttribute("Id") ?? "", target.startsWith("/") ? target.slice(1) : `word/${target}`);
    }
  }

  const doc = new DOMParser().parseFromString(strFromU8(xml), "application/xml");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error(`Couldn't read ${file.name}.`);

  const lines: string[] = [];
  const pictureRefs: { media: string; hint: string }[] = [];

  const recentText = () =>
    lines
      .slice(-3)
      .join(" ")
      .replace(/\[Picture \d+\]/g, "")
      .replace(/\s+/g, " ")
      .slice(-200);

  const paragraphText = (p: Element): string => {
    let text = "";
    for (const node of Array.from(p.getElementsByTagName("*"))) {
      const name = node.localName;
      if (name === "t" && node.namespaceURI === W) text += node.textContent ?? "";
      else if (name === "tab" && node.namespaceURI === W) text += "\t";
      else if ((name === "br" || name === "cr") && node.namespaceURI === W) text += "\n";
      else if (name === "blip" || name === "imagedata") {
        const id = node.getAttributeNS(R, "embed") || node.getAttributeNS(R, "id");
        const media = id ? targets.get(id) : undefined;
        if (media) {
          const before = text.replace(/\[Picture \d+\]/g, "").trim();
          pictureRefs.push({ media, hint: (before || recentText()).trim() });
          text += ` [Picture ${pictureRefs.length}] `;
        }
      }
    }
    return text.replace(/[ \t]+/g, " ").trim();
  };

  for (const el of Array.from(body.children)) {
    if (el.localName === "p") {
      const t = paragraphText(el);
      if (t) lines.push(t);
    } else if (el.localName === "tbl") {
      for (const row of Array.from(el.getElementsByTagNameNS(W, "tr"))) {
        lines.push(
          Array.from(row.getElementsByTagNameNS(W, "tc"))
            .map((cell) => Array.from(cell.getElementsByTagNameNS(W, "p")).map(paragraphText).join(" "))
            .join(" | ")
        );
      }
    }
  }

  const pictures: DocxPicture[] = [];
  const skippedPictures: number[] = [];
  for (const [i, ref] of pictureRefs.entries()) {
    const ext = ref.media.split(".").pop()?.toLowerCase() ?? "";
    const bytes = files[ref.media];
    const type = IMAGE_TYPES[ext];
    if (!bytes || !type) {
      skippedPictures.push(i + 1);
      continue;
    }
    try {
      const scaled = await downscaleImageFile(new File([bytes], ref.media, { type }));
      pictures.push({ ...scaled, hint: `Picture ${i + 1} in ${file.name}, after: ${ref.hint || "(start of document)"}` });
    } catch {
      skippedPictures.push(i + 1);
    }
  }

  if (lines.length === 0 && pictures.length === 0) throw new Error(`${file.name} has nothing to read.`);

  const textPages: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 2 > PAGE_CHARS) {
      textPages.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${line}` : line;
  }
  if (current) textPages.push(current);

  return { textPages, pictures, skippedPictures };
}
