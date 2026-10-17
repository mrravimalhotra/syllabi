/** Wraps raw 16-bit mono PCM audio (what Gemini speech returns) in a WAV header so any browser can play it. */
export function pcmToWav(pcm: Buffer, sampleRate = 24_000): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // size of the format block
  header.writeUInt16LE(1, 20); // plain PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // bytes per sample frame
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Splits text into pieces of at most `max` characters, at sentence ends where possible. */
export function splitForSpeech(text: string, max = 900): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?।]+[.!?।]*\s*/g) ?? [text];
  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > max) {
      pieces.push(current.trim());
      current = "";
    }
    // A single very long sentence is cut at the limit rather than refused.
    let rest = sentence;
    while (rest.length > max) {
      pieces.push(rest.slice(0, max).trim());
      rest = rest.slice(max);
    }
    current += rest;
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}
