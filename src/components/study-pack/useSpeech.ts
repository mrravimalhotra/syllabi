"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** Picks the most familiar voice: Indian English (or Hindi for Devanagari text), then any English. */
function pickVoice(text: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (/[ऀ-ॿ]/.test(text)) {
    return voices.find((v) => v.lang === "hi-IN") ?? voices.find((v) => v.lang.startsWith("hi"));
  }
  return (
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang === "en-GB") ??
    voices.find((v) => v.lang.startsWith("en"))
  );
}

/**
 * Read-aloud with the browser's built-in speech (no cost, works offline on
 * most phones). One thing speaks at a time; `speakingId` says which.
 */
export function useSpeech() {
  const supported = useSyncExternalStore(
    noop,
    () => "speechSynthesis" in window,
    () => false
  );
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [rate, setRate] = useState(0.95);

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  const speak = useCallback(
    (id: string, text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      if (speakingId === id) {
        setSpeakingId(null);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(text);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.rate = rate;
      utterance.onend = () => setSpeakingId((current) => (current === id ? null : current));
      utterance.onerror = utterance.onend;
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    },
    [supported, speakingId, rate]
  );

  // Stop talking when the page closes or the view goes away.
  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return { supported, speakingId, speak, stop, rate, setRate };
}

export type Speech = ReturnType<typeof useSpeech>;
