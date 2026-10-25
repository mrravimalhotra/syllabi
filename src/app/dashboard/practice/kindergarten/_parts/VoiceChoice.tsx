"use client";

import { Chip } from "@/app/dashboard/practice/kindergarten/_parts/Chip";
import { useSoundEffects } from "@/components/practice/useSoundEffects";

/** Which voice reads to the child: the friendly one made by the app, or the phone's own. */
/** The chime for a right answer and the soft tone for a wrong one, in every game (one switch for the whole app on this device). */
export function SoundEffectsChoice() {
  const [on, setOn] = useSoundEffects();
  return (
    <section className="space-y-2 text-sm text-slate-600">
      <p className="font-semibold text-slate-900">Sound effects</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sound effects">
        <Chip on={on} onClick={() => setOn(true)}>
          On
        </Chip>
        <Chip on={!on} onClick={() => setOn(false)}>
          Off
        </Chip>
      </div>
      <p className="text-xs text-slate-500">A short chime for a right answer and a soft tone for a wrong one, in every game.</p>
    </section>
  );
}

export function VoiceChoice({ voice, onChoose }: { voice: "natural" | "phone"; onChoose: (next: "natural" | "phone") => void }) {
  return (
    <section className="space-y-2 text-sm text-slate-600">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Voice">
        <Chip on={voice === "natural"} onClick={() => onChoose("natural")}>
          Friendly voice
        </Chip>
        <Chip on={voice === "phone"} onClick={() => onChoose("phone")}>
          This phone&apos;s voice
        </Chip>
      </div>
      <p className="text-xs text-slate-500">
        The friendly voice is made by the app and may take a few seconds the first time a word is heard. If it isn&apos;t available, the
        phone&apos;s voice reads instead.
      </p>
    </section>
  );
}
