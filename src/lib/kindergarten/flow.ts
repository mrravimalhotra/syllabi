// The "Say it back" lesson for one word as a small state machine (no screen or
// microphone in here, so it can be tested on its own). The child hears each
// sound, says it back, then says the whole word:
//   model → listen → evaluating (per sound, up to 2 retries) → blend → listen → evaluate.

const SOUND_PASS = 60;
const BLEND_PASS = 65;
const MAX_RETRIES = 2;

export type FlowState =
  | { step: "init" }
  | { step: "model"; sound: number; tries: number; scores: number[] }
  | { step: "listen"; sound: number; tries: number; scores: number[] }
  | { step: "evaluating"; sound: number; tries: number; scores: number[] }
  | { step: "blending"; scores: number[] }
  | { step: "listenBlend"; scores: number[] }
  | { step: "evaluateBlend"; scores: number[] }
  | { step: "guide"; target: number; scores: number[] }
  | { step: "celebrate"; scores: number[]; blendScore: number | null };

export type FlowEvent =
  | { type: "START" }
  | { type: "MODEL_DONE" }
  /** The child's voice was captured (or nothing was heard). */
  | { type: "HEARD"; heard: boolean }
  | { type: "SCORED"; score: number }
  | { type: "BLEND_DONE" }
  | { type: "GUIDE_DONE" };

export const initialFlow: FlowState = { step: "init" };

/** Sounds in the word (3 for a CVC word). */
export function nextFlow(state: FlowState, event: FlowEvent, soundCount = 3): FlowState {
  switch (state.step) {
    case "init":
      return event.type === "START" ? { step: "model", sound: 0, tries: 0, scores: [] } : state;
    case "model":
      return event.type === "MODEL_DONE" ? { ...state, step: "listen" } : state;
    case "listen":
      if (event.type !== "HEARD") return state;
      // Nothing heard counts as a try, so the child is never stuck waiting.
      return event.heard ? { ...state, step: "evaluating" } : retryOrMove(state, 0, soundCount);
    case "evaluating": {
      if (event.type !== "SCORED") return state;
      return event.score >= SOUND_PASS ? moveOn(state, event.score, soundCount) : retryOrMove(state, event.score, soundCount);
    }
    case "blending":
      return event.type === "BLEND_DONE" ? { step: "listenBlend", scores: state.scores } : state;
    case "listenBlend":
      if (event.type !== "HEARD") return state;
      return event.heard
        ? { step: "evaluateBlend", scores: state.scores }
        : { step: "guide", target: weakest(state.scores), scores: state.scores };
    case "evaluateBlend":
      if (event.type !== "SCORED") return state;
      return event.score >= BLEND_PASS
        ? { step: "celebrate", scores: state.scores, blendScore: event.score }
        : { step: "guide", target: weakest(state.scores), scores: state.scores };
    case "guide":
      return event.type === "GUIDE_DONE" ? { step: "celebrate", scores: state.scores, blendScore: null } : state;
    case "celebrate":
      return state;
  }
}

type SoundStep = Extract<FlowState, { sound: number }>;

function record(scores: number[], sound: number, score: number): number[] {
  const next = [...scores];
  next[sound] = Math.max(next[sound] ?? 0, score);
  return next;
}

function moveOn(state: SoundStep, score: number, soundCount: number): FlowState {
  const scores = record(state.scores, state.sound, score);
  return state.sound + 1 < soundCount ? { step: "model", sound: state.sound + 1, tries: 0, scores } : { step: "blending", scores };
}

/** A weak try: hear the sound again; after the last retry, move on gently. */
function retryOrMove(state: SoundStep, score: number, soundCount: number): FlowState {
  if (state.tries < MAX_RETRIES) {
    return { step: "model", sound: state.sound, tries: state.tries + 1, scores: record(state.scores, state.sound, score) };
  }
  return moveOn(state, score, soundCount);
}

/** The sound that needs the most help (lowest score). */
function weakest(scores: number[]): number {
  let target = 0;
  for (let i = 1; i < scores.length; i++) if ((scores[i] ?? 0) < (scores[target] ?? 0)) target = i;
  return target;
}
