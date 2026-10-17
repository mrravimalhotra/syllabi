"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
 * Read-aloud. First choice is a natural, child-friendly voice made on the
 * server (and kept there, so each text is made once); if that is unavailable
 * (allowance used up, offline), the phone's own built-in voice reads it.
 * One thing speaks at a time; `speakingId` says which, `loadingId` which is
 * still being prepared.
 */
export function useSpeech(language = "en") {
  const browserVoice = useSyncExternalStore(
    noop,
    () => "speechSynthesis" in window,
    () => false
  );
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rate, setRate] = useState(0.95);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  // Voices already fetched this visit, so pressing Read aloud again is instant.
  const clipsRef = useRef(new Map<string, string>());

  const halt = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const stop = useCallback(() => {
    halt();
    setSpeakingId(null);
    setLoadingId(null);
  }, [halt]);

  const speakWithDevice = useCallback(
    (id: string, text: string) => {
      if (!browserVoice) {
        setSpeakingId(null);
        setNotice("This phone can't read aloud.");
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
    [browserVoice, language, rate]
  );

  const speak = useCallback(
    async (id: string, text: string) => {
      const wasSpeaking = speakingId === id || loadingId === id;
      halt();
      setSpeakingId(null);
      setLoadingId(null);
      setNotice(null);
      if (wasSpeaking) return; // pressing the same button again stops it

      const clipKey = `${language}|${text}`;
      let url = clipsRef.current.get(clipKey);
      if (!url) {
        const controller = new AbortController();
        requestRef.current = controller;
        setLoadingId(id);
        try {
          const res = await fetch("/api/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ text, language }),
          });
          if (!res.ok) throw new Error(`speech ${res.status}`);
          url = URL.createObjectURL(await res.blob());
          clipsRef.current.set(clipKey, url);
        } catch {
          if (controller.signal.aborted) return;
          setLoadingId(null);
          setNotice("The natural voice isn't available right now, so this phone's own voice is reading instead.");
          speakWithDevice(id, text);
          return;
        }
        if (controller.signal.aborted) return;
        requestRef.current = null;
        setLoadingId(null);
      }

      const audio = new Audio(url);
      audio.playbackRate = rate;
      audio.onended = () => setSpeakingId((current) => (current === id ? null : current));
      audio.onerror = () => {
        clipsRef.current.delete(clipKey);
        setSpeakingId(null);
      };
      audioRef.current = audio;
      setSpeakingId(id);
      audio.play().catch(() => {
        // The phone refused to start sound (it wants a tap): say so plainly.
        setSpeakingId(null);
        setNotice("Your phone didn't start the sound. Press Read aloud again.");
      });
    },
    [speakingId, loadingId, halt, language, rate, speakWithDevice]
  );

  // Stop talking when the page closes or the view goes away, and free the stored clips.
  useEffect(() => {
    const clips = clipsRef.current;
    return () => {
      halt();
      for (const url of clips.values()) URL.revokeObjectURL(url);
      clips.clear();
    };
  }, [halt]);

  return { supported: true, speakingId, loadingId, notice, speak, stop, rate, setRate };
}

export type Speech = ReturnType<typeof useSpeech>;

/**
 * Speaks one piece of text and calls onEnd when it finishes (or at once if
 * speech isn't available). Returns a function that stops it without calling onEnd.
 */
export function speakOnce(text: string, language: string, rate: number, onEnd: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd();
    return () => {};
  }
  let cancelled = false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(text, language);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = SPEECH_LANG[language] ?? "en-IN";
  }
  utterance.rate = rate;
  utterance.onend = () => {
    if (!cancelled) onEnd();
  };
  utterance.onerror = utterance.onend;
  window.speechSynthesis.speak(utterance);
  return () => {
    cancelled = true;
    window.speechSynthesis.cancel();
  };
}
