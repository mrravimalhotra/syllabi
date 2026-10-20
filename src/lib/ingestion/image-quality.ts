import sharp from "sharp";

/** What a page picture looks like, measured on a small grey copy of it. */
export interface ImageStats {
  /** Pixels on the shorter side of the picture as sent. */
  shortSide: number;
  /** Average brightness, 0 (black) to 255 (white). */
  brightness: number;
  /** How far the brightness varies (standard deviation): a faded or washed-out page has little. */
  contrast: number;
  /** Edge strength (standard deviation of a Laplacian filter): a blurred or out-of-focus page has little. */
  sharpness: number;
}

const SAMPLE_WIDTH = 900;
const LAPLACIAN = [0, 1, 0, 1, -4, 1, 0, 1, 0];

const spread = (values: Uint8Array | Float32Array | Int16Array, mean: number) => {
  let sum = 0;
  for (const v of values) sum += (v - mean) ** 2;
  return Math.sqrt(sum / values.length);
};

/** Measures a page picture (JPEG, PNG or WebP bytes). Returns null when it can't be decoded. */
export async function measureImage(bytes: Buffer): Promise<ImageStats | null> {
  try {
    const meta = await sharp(bytes).metadata();
    const shortSide = Math.min(meta.width ?? 0, meta.height ?? 0);
    const grey = sharp(bytes).rotate().greyscale().resize({ width: SAMPLE_WIDTH, withoutEnlargement: true });
    const { data: pixels } = await grey.clone().raw().toBuffer({ resolveWithObject: true });
    const brightness = pixels.reduce((a, v) => a + v, 0) / pixels.length;
    // The filter output is clipped to 0..255 around 128 so the sign survives in 8 bits.
    const { data: edges } = await grey.clone().convolve({ width: 3, height: 3, kernel: LAPLACIAN, offset: 128 }).raw().toBuffer({ resolveWithObject: true });
    return { shortSide, brightness, contrast: spread(pixels, brightness), sharpness: spread(edges, 128) };
  } catch {
    return null;
  }
}
