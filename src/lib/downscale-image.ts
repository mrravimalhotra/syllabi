export interface DownscaledImage {
  imageBase64: string;
  mimeType: string;
  /** Size of the original file (or rendered PDF page) and of the shrunk JPEG, in bytes, for the "saved X MB" note. */
  originalBytes?: number;
  bytes?: number;
}

// Shrunk the way chat apps (e.g. WhatsApp) shrink photos: a 1600 px longest
// side keeps printed text and handwriting readable for the AI, and the JPEG
// quality steps down until the page fits the size target. A 4-8 MB phone photo
// becomes about 200-350 KB, so uploads are quicker and use fewer AI tokens.
export const MAX_DIMENSION = 1600;
const TARGET_BYTES = 350 * 1024;
const QUALITY_STEPS = [0.8, 0.72, 0.64, 0.56];

/** Bytes in a base64 string's decoded data. */
function base64Bytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

/** Encodes a canvas as the smallest-needed JPEG: the first quality step under the target, else the lowest step. */
export function encodeCanvas(canvas: HTMLCanvasElement): { imageBase64: string; bytes: number } {
  let imageBase64 = "";
  for (const quality of QUALITY_STEPS) {
    imageBase64 = canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
    if (base64Bytes(imageBase64) <= TARGET_BYTES) break;
  }
  return { imageBase64, bytes: base64Bytes(imageBase64) };
}

/**
 * Re-encodes an image file to a size-capped JPEG in the browser before upload.
 * A phone photo can be several MB at native resolution; multiplied across a
 * chapter that is what makes uploads slow, so every page is normalised here.
 */
export async function downscaleImageFile(file: File): Promise<DownscaledImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  // White first, so transparent PNGs don't turn black as JPEGs.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const { imageBase64, bytes } = encodeCanvas(canvas);
  // An already-small JPEG (e.g. a photo shared through WhatsApp) can come out
  // larger after re-encoding: then send the original as it is.
  if (file.type === "image/jpeg" && scale === 1 && file.size <= bytes) {
    const original = await fileToBase64(file);
    return { imageBase64: original, mimeType: "image/jpeg", originalBytes: file.size, bytes: file.size };
  }
  return { imageBase64, mimeType: "image/jpeg", originalBytes: file.size, bytes };
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A cheap fingerprint of an image's data, to spot the same page added twice. */
export function imageFingerprint(base64: string): string {
  let hash = 2166136261;
  for (let i = 0; i < base64.length; i += 7) {
    hash ^= base64.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${base64.length}:${(hash >>> 0).toString(36)}`;
}

/** "38.2 MB" / "640 KB". */
export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
