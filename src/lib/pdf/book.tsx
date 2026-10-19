import { Document, Image, Page, StyleSheet, Text, renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { FONT_FAMILY } from "@/lib/pdf/fonts";

export interface BookPdfPage {
  number: number;
  /** A saved picture of the page. */
  image?: { data: Buffer; mimeType: string };
  /** The page's text, for pages that have no picture. */
  text?: string;
}

const styles = StyleSheet.create({
  picturePage: { padding: 18 },
  // A4 is 595 x 842 points; the page padding of 18 leaves this much room (a little less, so it never spills).
  picture: { width: 559, height: 798, objectFit: "contain" },
  textPage: { paddingTop: 40, paddingBottom: 50, paddingHorizontal: 44, fontSize: 11, fontFamily: FONT_FAMILY },
  pageNumber: { fontSize: 9, color: "#94a3b8", marginBottom: 10 },
  text: { lineHeight: 1.5 },
});

/** PDF viewers read JPEG and PNG; a WebP picture is turned into a JPEG first. */
async function readable(image: { data: Buffer; mimeType: string }): Promise<{ data: Buffer; format: "jpg" | "png" }> {
  if (image.mimeType === "image/png") return { data: image.data, format: "png" };
  if (image.mimeType === "image/jpeg") return { data: image.data, format: "jpg" };
  return { data: await sharp(image.data).jpeg({ quality: 85 }).toBuffer(), format: "jpg" };
}

/** A book's saved pages as one PDF, in page order: a picture page per photo or scan, a text page per Word page. */
export async function renderBookPdf(title: string, pages: BookPdfPage[]): Promise<Buffer> {
  const prepared = await Promise.all(pages.map(async (p) => ({ ...p, picture: p.image ? await readable(p.image) : null })));
  const doc = (
    <Document title={title} author="Syllabi">
      {prepared.map((p) =>
        p.picture ? (
          <Page key={p.number} size="A4" style={styles.picturePage}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt */}
            <Image style={styles.picture} src={{ data: p.picture.data, format: p.picture.format }} />
          </Page>
        ) : (
          <Page key={p.number} size="A4" style={styles.textPage}>
            <Text style={styles.pageNumber}>Page {p.number}</Text>
            <Text style={styles.text}>{p.text}</Text>
          </Page>
        )
      )}
    </Document>
  );
  return renderToBuffer(doc);
}
