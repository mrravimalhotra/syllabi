"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { SPEECH_LANG } from "@/lib/generation/language";

const noop = () => () => {};

/**
 * Picks the most familiar voice for the pack's language: Indian English, Hindi,
 * Marathi (falling back to a Hindi voice, which reads Devanagari) or French.
 */
function pickVoice(text: string, language: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const find = (...langs: string[]) => {
    for (const lang of langs) {
      const voice = voices.find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang));
      if (voice) return voice;
    }
    return undefined;
  };
  if (language === "mr") return find("mr-in", "mr", "hi-in", "hi");
  if (language === "hi" || (/[ऀ-ॿ]/.test(text) && language !== "fr")) return find("hi-in", "hi");
  if (language === "fr") return find("fr-fr", "fr");
  return find("en-in", "en-gb", "en");
}

/**
 * Read-aloud with the browser's built-in speech (no cost, works offline on
 * most phones). One thing speaks at a time; `speakingId` says which.
 */
export function useSpeech(language = "en") {
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
      const voice = pickVoice(text, language);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        // No matching voice installed: the language tag still helps the browser choose.
        utterance.lang = SPEECH_LANG[language] ?? "en-IN";
      }
      utterance.rate = rate;
      utterance.onend = () => setSpeakingId((current) => (current === id ? null : current));
      utterance.onerror = utterance.onend;
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    },
    [supported, speakingId, rate, language]
  );

  // Stop talking when the page closes or the view goes away.
  useEffect(() => () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return { supported, speakingId, speak, stop, rate, setRate };
}

export type Speech = ReturnType<typeof useSpeech>;
