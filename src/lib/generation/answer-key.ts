import { createHash } from "node:crypto";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * A fingerprint of everything that shapes an answer. Images are hashed, lists
 * sorted, and the full instructions included, so changing the prompts or the
 * model automatically stops old answers being reused.
 */
export function answerKey(parts: Record<string, unknown>): string {
  const normalised = JSON.stringify(parts, (_key, value) => {
    if (typeof value === "string" && value.length > 2000) return `sha256:${sha256(value)}`;
    return value;
  });
  return sha256(normalised);
}
