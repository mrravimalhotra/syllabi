// Capturing a child's voice: 16 kHz, one channel, 16-bit, ending by itself when
// the child stops talking. The signal helpers are plain functions so they can be
// tested without a microphone; `listenOnce` is the browser part.

const TARGET_RATE = 16_000;
/** Silence after speech that ends a recording. */
const SILENCE_END_MS = 1_200;
/** Longest one recording lasts once the child starts speaking. */
const MAX_SPEECH_MS = 3_500;
/** How long to wait for the child to start before giving up. */
const WAIT_FOR_SPEECH_MS = 5_000;
/** Loudness (RMS, 0..1) above which the child counts as speaking. */
const SPEECH_RMS = 0.02;

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Decides from loudness readings when speech starts and ends. */
export class Endpointer {
  private heardAt: number | null = null;
  private quietSince: number | null = null;
  private startedAt: number | null = null;

  /** Feed one reading with the time (ms) it was taken; returns why recording should stop, if it should. */
  push(level: number, now: number): "none" | "silence" | "max" | "nobody" {
    this.startedAt ??= now;
    if (level >= SPEECH_RMS) {
      this.heardAt ??= now;
      this.quietSince = null;
    } else if (this.heardAt !== null) {
      this.quietSince ??= now;
    }
    if (this.heardAt === null) return now - this.startedAt >= WAIT_FOR_SPEECH_MS ? "nobody" : "none";
    if (now - this.heardAt >= MAX_SPEECH_MS) return "max";
    if (this.quietSince !== null && now - this.quietSince >= SILENCE_END_MS) return "silence";
    return "none";
  }

  get heard(): boolean {
    return this.heardAt !== null;
  }
}

/** Averages samples down to 16 kHz (the sound is first smoothed by the averaging). */
export function toSixteenK(input: Float32Array, rate: number): Float32Array {
  if (rate <= TARGET_RATE) return input;
  const ratio = rate / TARGET_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j];
    out[i] = sum / Math.max(1, to - from);
  }
  return out;
}

/** A WAV file (16-bit PCM, mono) from samples between -1 and 1. */
export function encodeWav(samples: Float32Array, rate = TARGET_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export interface Heard {
  wav: Blob;
  /** The child was heard speaking (not just silence). */
  heard: boolean;
}

const WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; }
}
registerProcessor("tap", Tap);`;

/**
 * Listens through the microphone until the child has spoken and gone quiet.
 * `onLevel` gets the live loudness (0..1) for the sound-wave animation;
 * `signal` stops the listening early. Throws if the microphone is not allowed.
 */
export async function listenOnce(onLevel: (level: number) => void, signal?: AbortSignal): Promise<Heard> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const context = new AudioContext();
  const chunks: Float32Array[] = [];
  const ending = new Endpointer();
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    const source = context.createMediaStreamSource(stream);
    const tap = new AudioWorkletNode(context, "tap");
    source.connect(tap);
    await new Promise<void>((resolve) => {
      const stop = () => resolve();
      signal?.addEventListener("abort", stop, { once: true });
      if (signal?.aborted) return resolve();
      tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const level = rms(e.data);
        onLevel(Math.min(1, level * 8));
        chunks.push(e.data);
        const why = ending.push(level, performance.now());
        // Before the child speaks, only a short lead-in is kept.
        if (!ending.heard && chunks.length > 40) chunks.shift();
        if (why !== "none") resolve();
      };
    });
    const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.length;
    }
    onLevel(0);
    return { wav: new Blob([encodeWav(toSixteenK(all, context.sampleRate))], { type: "audio/wav" }), heard: ending.heard };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    void context.close();
  }
}
