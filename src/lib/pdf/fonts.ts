import path from "node:path";
import { Font } from "@react-pdf/renderer";

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

export const FONT_FAMILY = ["NotoSans", "NotoSansMath", "NotoSansDevanagari"];
export const CODE_FONT_FAMILY = ["NotoSansMono", ...FONT_FAMILY];

