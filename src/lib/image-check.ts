// Cheap checks that base64 text really is the kind of picture it claims to be,
// before it is stored or sent to an AI (which would pay for reading garbage).

const SIGNATURES: Record<string, string> = {
  "image/jpeg": "/9j/", // FF D8 FF
  "image/png": "iVBORw0KGgo", // 89 50 4E 47 0D 0A 1A 0A
  "image/webp": "UklGR", // "RIFF"
};

export const IMAGE_MIME_TYPES = new Set(Object.keys(SIGNATURES));

/** True when `base64` starts like a file of type `mimeType` and uses only base64 characters. */
export function looksLikeImage(base64: string, mimeType: string): boolean {
  const signature = SIGNATURES[mimeType];
  if (!signature || !base64.startsWith(signature)) return false;
  // Checking the start and end is enough to catch pasted text and truncated data without scanning megabytes.
  return /^[A-Za-z0-9+/]+$/.test(base64.slice(0, 256)) && /^[A-Za-z0-9+/]*={0,2}$/.test(base64.slice(-8));
}
