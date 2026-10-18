"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { soundText } from "@/lib/kindergarten/phonics";

// A saved choice per device (which voice the child hears), kept in the browser.
const VOICE_KEY = "syllabi-kg-voice";
const listeners = new Set<() => void>();

function readVoice(): "natural" | "phone" {
  try {
    return localStorage.getItem(VOICE_KEY) === "phone" ? "phone" : "natural";
  } catch {
    return "natural";
  }
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
}

/** Which voice reads to the child: the natural one made by the app, or the phone's own. */
export function useVoiceChoice() {
  const voice = useSyncExternalStore(subscribe, readVoice, () => "natural" as const);
  const choose = useCallback((next: "natural" | "phone") => {
    try {
      localStorage.setItem(VOICE_KEY, next);
    } catch {
      // Not saved; it still applies until the page closes.
    }
    listeners.forEach((l) => l());
  }, []);
  return { voice, choose };
}

const NATURAL_WAIT_MS = 5_000;

/**
 * Speaks short phrases to a child. `say` returns when the phrase has been
 * spoken (or could not be). A phrase is fetched once per visit; the server
 * keeps it for good, so repeats are instant. If the natural voice is slow or
 * unavailable, the phone's own voice reads instead, so the activity never stalls.
 */
export function useSay() {
  const { voice } = useVoiceChoice();
  const clips = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, Promise<string | null>>());
  const audio = useRef<HTMLAudioElement | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  const fetchClip = useCallback((text: string): Promise<string | null> => {
    const known = clips.current.get(text);
    if (known) return Promise.resolve(known);
    let request = pending.current.get(text);
    if (!request) {
      request = fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: "en" }),
      })
        .then(async (res) => {
          if (!res.ok) return null;
          const url = URL.createObjectURL(await res.blob());
          clips.current.set(text, url);
          return url;
        })
        .catch(() => null)
        .finally(() => pending.current.delete(text));
      pending.current.set(text, request);
    }
    return request;
  }, []);

  const stop = useCallback(() => {
    cancel.current?.();
    cancel.current = null;
    audio.current?.pause();
    audio.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const speakWithPhone = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!("speechSynthesis" in window)) return resolve();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-IN";
        u.rate = 0.8;
        u.pitch = 1.15;
        // Some phones never say "finished": don't let the activity wait for ever.
        const giveUp = setTimeout(resolve, Math.max(2_500, text.length * 150));
        const done = () => {
          clearTimeout(giveUp);
          resolve();
        };
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.speak(u);
      }),
    []
  );

  const playUrl = useCallback(
    (url: string) =>
      new Promise<void>((resolve) => {
        const a = new Audio(url);
        audio.current = a;
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.play().catch(() => resolve());
      }),
    []
  );

  const say = useCallback(
    async (text: string): Promise<void> => {
      stop();
      let cancelled = false;
      cancel.current = () => {
        cancelled = true;
      };
      if (voice === "natural") {
        const url = await Promise.race([fetchClip(text), new Promise<null>((r) => setTimeout(() => r(null), NATURAL_WAIT_MS))]);
        if (cancelled) return;
        if (url) {
          await playUrl(url);
          return;
        }
      }
      if (!cancelled) await speakWithPhone(text);
    },
    [voice, stop, fetchClip, speakWithPhone, playUrl]
  );

  /**
   * A recorded sound for a letter: the grown-up's own recording (saved in their
   * account from the "Record the sounds" page), or a file in public/sounds.
   * Either is better than a speech voice for a pure sound. Which letters have a
   * recording is asked once per visit.
   */
  const recorded = useRef(new Map<string, Promise<string | null>>());
  const mine = useRef<Promise<Set<string>> | null>(null);
  const recording = useCallback((letter: string) => {
    let known = recorded.current.get(letter);
    if (!known) {
      mine.current ??= fetch("/api/sounds")
        .then((res) => (res.ok ? res.json() : { letters: [] }))
        .then((data) => new Set<string>(Array.isArray(data.letters) ? data.letters : []))
        .catch(() => new Set<string>());
      known = mine.current.then(async (letters) => {
        if (letters.has(letter)) {
          const res = await fetch(`/api/sounds/${letter}`).catch(() => null);
          if (res?.ok) {
            const url = URL.createObjectURL(await res.blob());
            urls.current.push(url);
            return url;
          }
        }
        const file = `/sounds/${letter}.mp3`;
        return fetch(file, { method: "HEAD" })
          .then((res) => (res.ok && (res.headers.get("content-type") ?? "").startsWith("audio") ? file : null))
          .catch(() => null);
      });
      recorded.current.set(letter, known);
    }
    return known;
  }, []);
  const urls = useRef<string[]>([]);

  /** Says the sound a letter makes (not its name); `slow` stretches sounds that can be held. */
  const sound = useCallback(
    async (letter: string, slow = false): Promise<void> => {
      const url = await recording(letter);
      if (url) {
        stop();
        await playUrl(url);
        return;
      }
      await say(soundText(letter, slow));
    },
    [recording, stop, playUrl, say]
  );

  /** Gets phrases ready in the background, so they play at once when needed. */
  const prepare = useCallback(
    (texts: string[]) => {
      if (voice === "natural") for (const t of texts) void fetchClip(t);
    },
    [voice, fetchClip]
  );

  useEffect(() => {
    const store = clips.current;
    const mineUrls = urls.current;
    return () => {
      stop();
      for (const url of store.values()) URL.revokeObjectURL(url);
      for (const url of mineUrls) URL.revokeObjectURL(url);
      store.clear();
    };
  }, [stop]);

  return { say, sound, prepare, stop };
}
