// Reads a streamed answer from the generate routes: one JSON object per line,
// "text" pieces while the answer is written, then "done" with the checked
// answer, or "error" with the message to show.

class AnswerStreamError extends Error {}

export async function readAnswerStream<T>(
  body: ReadableStream<Uint8Array>,
  handlers: { onText: (delta: string) => void; onReset: () => void }
): Promise<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let done: T | null = null;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let event: { type?: string; delta?: string; answer?: T; error?: string };
    try {
      event = JSON.parse(line);
    } catch {
      return; // a damaged line: the final answer decides the outcome
    }
    if (event.type === "text" && typeof event.delta === "string") handlers.onText(event.delta);
    else if (event.type === "reset") handlers.onReset();
    else if (event.type === "done" && event.answer) done = event.answer;
    else if (event.type === "error") throw new AnswerStreamError(event.error || "Couldn't make your answer. Wait a minute and try again.");
  };

  for (;;) {
    const { value, done: finished } = await reader.read();
    if (value) pending += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = pending.indexOf("\n")) >= 0) {
      handleLine(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
    }
    if (finished) break;
  }
  handleLine(pending);

  if (!done) {
    throw new AnswerStreamError("The connection dropped before the answer finished. If it was saved, it will appear in My Documents. Otherwise, try again.");
  }
  return done;
}
