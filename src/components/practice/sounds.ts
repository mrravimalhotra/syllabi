// Short celebration and "try again" sounds, made in the browser (no files).

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, type: OscillatorType, frequency: number, start: number, length: number, volume: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g);
  g.connect(c.destination);
  o.type = type;
  o.frequency.setValueAtTime(frequency, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(volume, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, start + length);
  o.start(start);
  o.stop(start + length + 0.05);
}

/** A rising C-major arpeggio with a little sparkle on top. */
export function playCorrect() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, "sine", f, t + i * 0.1, 0.3, 0.25));
  [1318.5, 1568, 2093].forEach((f, i) => tone(c, "triangle", f, t + 0.3 + i * 0.07, 0.18, 0.08));
}

/** A gentle falling "hmm": not alarming. */
export function playWrong() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  [330, 262].forEach((f, i) => tone(c, "triangle", f, t + i * 0.16, 0.22, 0.18));
}
