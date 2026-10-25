"use client";

import { useSyncExternalStore } from "react";
import { onSoundEffectsChange, setSoundEffects, soundEffectsOn } from "@/components/practice/sounds";

/** The sound-effects switch shared by every game: whether it is on, and how to change it. */
export function useSoundEffects(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(onSoundEffectsChange, soundEffectsOn, () => true);
  return [on, setSoundEffects];
}
