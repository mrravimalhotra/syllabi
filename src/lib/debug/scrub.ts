// Takes private and bulky things out of what a problem report carries: passwords, tokens and keys, and
// image or file data (a photo sent with a question is huge and not needed to find a bug). Used when the
// browser captures a request and again on the server, so a report is clean even if the browser's copy was not.

const SECRET_KEY = /pass(word)?|token|secret|api[_-]?key|authorization|cookie|session|credential/i;
const LONG_DATA = /^(?:data:[^,]{0,80},)?[A-Za-z0-9+/=_-]{400,}$/;
const MAX_TEXT = 2500;
const MAX_ITEMS = 20;
const MAX_DEPTH = 7;

/** A long text cut short, saying how much was left out. */
export function shorten(text: string, max = MAX_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}… (${(text.length - max).toLocaleString("en-IN")} more characters)` : text;
}

/** A value with secrets hidden, file data replaced by its size, and long text and lists cut short. */
export function scrub(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    if (LONG_DATA.test(value)) return `[file or image data, about ${Math.round((value.length * 0.75) / 1024)} KB]`;
    return shorten(value);
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[…]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => scrub(v, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `(${value.length - MAX_ITEMS} more)`] : items;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[hidden]" : scrub(v, depth + 1)]),
  );
}

/** Text as it was sent or received (JSON or not) with secrets and file data taken out, at most `max` characters. */
export function scrubText(text: string, max = 3000): string {
  try {
    return shorten(JSON.stringify(scrub(JSON.parse(text))), max);
  } catch {
    // Not JSON (or cut off part-way, like a stream): hide long runs of data and keep the rest.
    return shorten(
      text
        .replace(/[A-Za-z0-9+/=_-]{400,}/g, "[file or image data]")
        .replace(/("(?:[^"]*(?:pass(?:word)?|token|secret|api[_-]?key|authorization|cookie)[^"]*)"\s*:\s*)"[^"]*"/gi, '$1"[hidden]"'),
      max,
    );
  }
}
