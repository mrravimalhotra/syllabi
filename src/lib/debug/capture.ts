"use client";

import { scrub, scrubText, shorten } from "@/lib/debug/scrub";

// A short memory of what the screen did, kept in the browser (never sent anywhere until the person
// presses Send on a problem report): clicks, pages opened, errors, and every request the screen made
// with what it sent and what came back.

export interface Step {
  at: string;
  kind: "click" | "page" | "error";
  text: string;
}

interface CapturedRequest {
  at: string;
  method: string;
  path: string;
  status: number | null;
  ms: number;
  sent?: string;
  received?: string;
  error?: string;
}

export interface Snapshot {
  build: string;
  url: string;
  path: string;
  userAgent: string;
  viewport: string;
  language: string;
  online: boolean;
  steps: Step[];
  requests: CapturedRequest[];
  /** What is typed in the boxes on screen (not passwords), and the text of the page: the input and the output the person saw. */
  onScreen?: { fields: { label: string; value: string }[]; text: string };
}

const MAX_STEPS = 60;
const MAX_REQUESTS = 40;
const READ_LIMIT = 8000;
/** Requests that say nothing useful (or are the report itself). */
const SKIP = /^\/(api\/(bug-reports|version|log-error)|_next\/|manifest|sw\.js|favicon)/;
/** Answers that are not text (sound, PDFs, pictures). */
const NOT_TEXT = /^(audio|video|image)\/|application\/(pdf|octet-stream)/;

interface State {
  steps: Step[];
  requests: CapturedRequest[];
  installed: boolean;
}
const state: State = { steps: [], requests: [], installed: false };

const now = () => new Date().toISOString();

function pushStep(kind: Step["kind"], text: string) {
  state.steps.push({ at: now(), kind, text: shorten(text, 300) });
  if (state.steps.length > MAX_STEPS) state.steps.shift();
}

/** Records that a page was opened. */
export function notePage(path: string) {
  pushStep("page", `Opened ${path}`);
}

async function readBody(res: Response): Promise<string | undefined> {
  const type = res.headers.get("content-type") ?? "";
  if (NOT_TEXT.test(type)) return `[${type || "file"}, not shown]`;
  try {
    const reader = res.body?.getReader();
    if (!reader) return undefined;
    const decoder = new TextDecoder();
    let text = "";
    while (text.length < READ_LIMIT) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    void reader.cancel().catch(() => {});
    return scrubText(text, 3000);
  } catch {
    return undefined;
  }
}

function describeSent(init?: RequestInit): string | undefined {
  const body = init?.body;
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return scrubText(body, 3000);
  if (body instanceof FormData) return `[form with ${[...body.keys()].join(", ")}]`;
  if (body instanceof Blob) return `[${body.type || "file"}, about ${Math.round(body.size / 1024)} KB]`;
  return "[data]";
}

function installFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    const path = url.pathname + url.search;
    if (url.origin !== window.location.origin || SKIP.test(url.pathname)) return original(input, init);

    const entry: CapturedRequest = {
      at: now(),
      method: (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
      path: shorten(path, 200),
      status: null,
      ms: 0,
      sent: describeSent(init),
    };
    state.requests.push(entry);
    if (state.requests.length > MAX_REQUESTS) state.requests.shift();
    const started = performance.now();
    try {
      const res = await original(input, init);
      entry.status = res.status;
      entry.ms = Math.round(performance.now() - started);
      void readBody(res.clone()).then((text) => {
        entry.received = text;
      });
      return res;
    } catch (err) {
      entry.ms = Math.round(performance.now() - started);
      entry.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      throw err;
    }
  };
}

function labelOf(el: Element | null): string {
  const target = el?.closest("button, a, [role=button], [role=tab], [role=radio], summary, label");
  if (!target) return "";
  const text = target.getAttribute("aria-label") || (target as HTMLElement).innerText || target.getAttribute("title") || "";
  return `${target.tagName.toLowerCase()} "${text.replace(/\s+/g, " ").trim().slice(0, 60)}"`;
}

/** Starts the memory (once). Safe to call again. */
export function installCapture() {
  if (state.installed || typeof window === "undefined") return;
  state.installed = true;
  installFetch();
  document.addEventListener(
    "click",
    (e) => {
      const label = labelOf(e.target as Element);
      if (label) pushStep("click", `Clicked ${label}`);
    },
    true,
  );
  window.addEventListener("error", (e) => pushStep("error", `Error: ${e.message} (${e.filename?.split("/").pop() ?? ""}:${e.lineno})`));
  window.addEventListener("unhandledrejection", (e) =>
    pushStep("error", `Unhandled: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`),
  );
  const consoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    pushStep(
      "error",
      `console.error: ${args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(scrub(a)))).join(" ")}`,
    );
    consoleError(...args);
  };
}

/** What is typed in the page's boxes (never passwords or files) and the text of the main area. */
function readScreen(): NonNullable<Snapshot["onScreen"]> {
  const fields = [
    ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("main input, main textarea, main select"),
  ]
    .filter((el) => !["password", "hidden", "file"].includes((el as HTMLInputElement).type) && el.value)
    .slice(0, 20)
    .map((el) => ({
      label: shorten(
        el.getAttribute("aria-label") ||
          document.querySelector(`label[for="${el.id}"]`)?.textContent ||
          el.getAttribute("placeholder") ||
          el.name ||
          el.tagName.toLowerCase(),
        80,
      ),
      value: shorten(el.value, 1500),
    }));
  const text = (document.querySelector("main") as HTMLElement | null)?.innerText ?? "";
  return { fields, text: shorten(text.replace(/\n{3,}/g, "\n\n"), 6000) };
}

/** Everything remembered, plus (when asked) what is on screen. */
export function takeSnapshot(includeScreen: boolean): Snapshot {
  return {
    build: process.env.NEXT_PUBLIC_BUILD_ID ?? "",
    url: window.location.href,
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight} (screen ${screen.width}x${screen.height}, pixel ratio ${window.devicePixelRatio})`,
    language: navigator.language,
    online: navigator.onLine,
    steps: [...state.steps],
    requests: state.requests.map((r) => ({ ...r })),
    ...(includeScreen ? { onScreen: readScreen() } : {}),
  };
}
