"use client";

import type { ReactNode } from "react";
import { Chip } from "@/app/dashboard/practice/kindergarten/_parts/Chip";
import { PLACE_MAX, type PlaceSettings } from "@/lib/kindergarten/place-value";
import { ROUND_SIZES, type CompareSettings, type CvcSettings, type SightSettings } from "@/lib/kindergarten/quiz";
import { SIGHT_LEVELS, SIGHT_LEVEL_LABELS, VOWELS, familiesOf, type Vowel } from "@/lib/kindergarten/words";

/** The picture word for each vowel, shown on its chip ("a as in cat"). */
const VOWEL_WORD: Record<Vowel, string> = { a: "cat", e: "hen", i: "pig", o: "dog", u: "sun" };

/** One choice on an activity's screen: a heading, an optional hint, and its options. `group` names the options for screen readers. */
function Setting({ label, group = label, hint, children }: { label: string; group?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label={group}>
        {children}
      </div>
    </section>
  );
}

function RoundSize({ current, set, unit }: { current: number; set: (n: 5 | 10) => void; unit: string }) {
  return (
    <Setting label="How many in a round" group="Questions in a round">
      {ROUND_SIZES.map((n) => (
        <Chip key={n} on={current === n} onClick={() => set(n)}>
          {n} {unit}
        </Chip>
      ))}
    </Setting>
  );
}

/** Vowels, word family and round size: shared by Listen and blend, Spell the word and Word explorer. */
export function CvcChoices({ cvc, setCvc, shared }: { cvc: CvcSettings; setCvc: (next: CvcSettings) => void; shared?: boolean }) {
  const toggleVowel = (v: Vowel) => {
    const next = cvc.vowels.includes(v) ? cvc.vowels.filter((x) => x !== v) : [...cvc.vowels, v];
    if (next.length === 0) return;
    const vowels = VOWELS.filter((x) => next.includes(x));
    // A family that no chosen vowel has any more is dropped.
    const family = cvc.family && vowels.some((x) => familiesOf(x).includes(cvc.family!)) ? cvc.family : undefined;
    setCvc({ ...cvc, vowels, family });
  };
  return (
    <>
      <Setting
        label="Vowel sounds to practise"
        hint={shared ? "Shared by Listen and blend, Spell the word and Word explorer." : "Choose one or more."}
      >
        {VOWELS.map((v) => (
          <Chip key={v} on={cvc.vowels.includes(v)} onClick={() => toggleVowel(v)}>
            {v} <span className="text-slate-400">as in {VOWEL_WORD[v]}</span>
          </Chip>
        ))}
      </Setting>
      <Setting label="Word family" hint="Rhyming words, like cat, hat and mat.">
        <Chip on={!cvc.family} onClick={() => setCvc({ ...cvc, family: undefined })}>
          All words
        </Chip>
        {cvc.vowels.flatMap(familiesOf).map((rime) => (
          <Chip key={rime} on={cvc.family === rime} onClick={() => setCvc({ ...cvc, family: rime })}>
            -{rime}
          </Chip>
        ))}
      </Setting>
      <RoundSize current={cvc.questions} set={(n) => setCvc({ ...cvc, questions: n })} unit="words" />
    </>
  );
}

export function SightChoices({ sight, setSight }: { sight: SightSettings; setSight: (next: SightSettings) => void }) {
  return (
    <>
      <Setting label="Which words" hint="The sets follow the order schools teach them.">
        {SIGHT_LEVELS.map((level) => (
          <Chip key={level} on={sight.level === level} onClick={() => setSight({ ...sight, level })}>
            {SIGHT_LEVEL_LABELS[level]}
          </Chip>
        ))}
      </Setting>
      <RoundSize current={sight.questions} set={(n) => setSight({ ...sight, questions: n })} unit="words" />
    </>
  );
}

export function CompareChoices({ compare, setCompare }: { compare: CompareSettings; setCompare: (next: CompareSettings) => void }) {
  return (
    <>
      <Setting label="How big the groups are">
        {([5, 10, 20] as const).map((max) => (
          <Chip key={max} on={compare.max === max} onClick={() => setCompare({ ...compare, max })}>
            Up to {max}
          </Chip>
        ))}
      </Setting>
      <RoundSize current={compare.questions} set={(n) => setCompare({ ...compare, questions: n })} unit="questions" />
    </>
  );
}

export function PlaceChoices({ place, setPlace }: { place: PlaceSettings; setPlace: (next: PlaceSettings) => void }) {
  return (
    <>
      <Setting label="How big the numbers are">
        {PLACE_MAX.map((max) => (
          <Chip key={max} on={place.max === max} onClick={() => setPlace({ ...place, max })}>
            Up to {max}
          </Chip>
        ))}
      </Setting>
      <RoundSize current={place.questions} set={(n) => setPlace({ ...place, questions: n })} unit="questions" />
    </>
  );
}

/** One line on a tile saying what is chosen now ("a, e · -at · 5 words"). */
export const summary = {
  cvc: (c: CvcSettings) => `${c.vowels.join(", ")} · ${c.family ? `-${c.family}` : "All words"} · ${c.questions} words`,
  sight: (s: SightSettings) => `${SIGHT_LEVEL_LABELS[s.level].split(" (")[0]} · ${s.questions} words`,
  compare: (c: CompareSettings) => `Up to ${c.max} · ${c.questions} questions`,
  place: (p: PlaceSettings) => `Up to ${p.max} · ${p.questions} questions`,
};
