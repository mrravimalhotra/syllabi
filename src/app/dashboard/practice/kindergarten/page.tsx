"use client";

import Link from "next/link";
import { useState } from "react";
import { ActivityCard, MenuLink } from "@/app/dashboard/practice/kindergarten/_parts/ActivityCard";
import { ActivityGame, type Activity } from "@/app/dashboard/practice/kindergarten/_parts/ActivityGame";
import { Chip } from "@/app/dashboard/practice/kindergarten/_parts/Chip";
import { SoundGuide } from "@/app/dashboard/practice/kindergarten/_parts/SoundGuide";
import { VoiceChoice } from "@/app/dashboard/practice/kindergarten/_parts/VoiceChoice";
import { isCompare, isCvc, isPlace, isSight } from "@/app/dashboard/practice/kindergarten/_parts/prefs";
import { useSay, useVoiceChoice } from "@/components/kindergarten/useSay";
import { PageHeader } from "@/components/ui";
import { DEFAULT_PLACE, PLACE_MAX } from "@/lib/kindergarten/place-value";
import { DEFAULT_COMPARE, DEFAULT_CVC, DEFAULT_SIGHT, ROUND_SIZES } from "@/lib/kindergarten/quiz";
import { SIGHT_LEVELS, SIGHT_LEVEL_LABELS, VOWELS, type Vowel } from "@/lib/kindergarten/words";
import { newSeed } from "@/lib/practice/random";
import { usePref } from "@/lib/use-pref";

/** The picture word for each vowel, shown on its chip ("a as in cat"). */
const VOWEL_WORD: Record<Vowel, string> = { a: "cat", e: "hen", i: "pig", o: "dog", u: "sun" };

/**
 * Kindergarten: short, picture-led activities for the youngest learners,
 * made entirely by code (no AI), read aloud to the child, with no scores to
 * fail. Grown-ups choose what to practise under each activity.
 */
export default function KindergartenPage() {
  const [activity, setActivity] = useState<{ kind: Activity; seed: number } | null>(null);
  const [cvc, setCvc] = usePref("syllabi-kg-cvc", DEFAULT_CVC, isCvc);
  const [sight, setSight] = usePref("syllabi-kg-sight", DEFAULT_SIGHT, isSight);
  const [compare, setCompare] = usePref("syllabi-kg-compare", DEFAULT_COMPARE, isCompare);
  const [place, setPlace] = usePref("syllabi-kg-place", DEFAULT_PLACE, isPlace);
  const { voice, choose } = useVoiceChoice();
  const speaker = useSay();

  const start = (kind: Activity) => setActivity({ kind, seed: newSeed() });
  const exit = () => {
    speaker.stop();
    setActivity(null);
  };
  const again = () => setActivity((a) => (a ? { ...a, seed: newSeed() } : a));

  if (activity) {
    return (
      <ActivityGame
        kind={activity.kind}
        seed={activity.seed}
        cvc={cvc}
        sight={sight}
        compare={compare}
        place={place}
        voice={speaker}
        onAgain={again}
        onPlay={() => start("place")}
        onExit={exit}
      />
    );
  }

  const toggleVowel = (v: Vowel) => {
    const next = cvc.vowels.includes(v) ? cvc.vowels.filter((x) => x !== v) : [...cvc.vowels, v];
    if (next.length > 0) setCvc({ ...cvc, vowels: VOWELS.filter((x) => next.includes(x)) });
  };
  const roundSizes = (current: number, set: (n: 5 | 10) => void, label: string) =>
    ROUND_SIZES.map((n) => (
      <Chip key={n} on={current === n} onClick={() => set(n)}>
        {n} {label}
      </Chip>
    ));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Kindergarten"
        description="Short activities for little learners. Each is read aloud, uses pictures, and has no scores to fail: a wrong tap just says “try again”. Hand the phone to your child, and choose what to practise below."
      />
      <Link href="/dashboard/practice" className="text-sm font-medium text-brand-700 hover:underline">
        ← Back to Practice
      </Link>

      <ActivityCard
        emoji="👂"
        title="Listen and blend"
        description="Start here. Hear the sounds of a word one at a time (m… a… p…), put them together, and tap the picture. Uses the same vowels as Spell the word below."
        onPlay={() => start("blend")}
      />

      <ActivityCard
        emoji="🐱"
        title="Spell the word (CVC words)"
        description="See a picture, hear the word, tap the three letters in order: c-a-t, d-o-g, s-u-n."
        onPlay={() => start("cvc")}
      >
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Vowel sounds to practise</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Vowel sounds to practise">
            {VOWELS.map((v) => (
              <Chip key={v} on={cvc.vowels.includes(v)} onClick={() => toggleVowel(v)}>
                {v} <span className="text-slate-400">as in {VOWEL_WORD[v]}</span>
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Questions in a round">
            {roundSizes(cvc.questions, (n) => setCvc({ ...cvc, questions: n }), "words")}
          </div>
        </div>
      </ActivityCard>

      <ActivityCard
        emoji="👀"
        title="Find the word (sight words)"
        description="Hear a common word like “the” or “you”, then find it among three words."
        onPlay={() => start("sight")}
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label="Which words">
          {SIGHT_LEVELS.map((level) => (
            <Chip key={level} on={sight.level === level} onClick={() => setSight({ ...sight, level })}>
              {SIGHT_LEVEL_LABELS[level]}
            </Chip>
          ))}
          {roundSizes(sight.questions, (n) => setSight({ ...sight, questions: n }), "words")}
        </div>
      </ActivityCard>

      <ActivityCard
        emoji="🍎"
        title="More, fewer or the same"
        description="Look at two groups of pictures and tap the one with more (or fewer), or “the same”."
        onPlay={() => start("compare")}
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label="How big the groups are">
          {([5, 10, 20] as const).map((max) => (
            <Chip key={max} on={compare.max === max} onClick={() => setCompare({ ...compare, max })}>
              Up to {max}
            </Chip>
          ))}
          {roundSizes(compare.questions, (n) => setCompare({ ...compare, questions: n }), "questions")}
        </div>
      </ActivityCard>

      <ActivityCard
        emoji="🔟"
        title="Place value and face value"
        description="Learn what a digit is, and what it is worth where it sits (the 4 in 47 is worth 40), with tens and ones blocks. Then play the quiz."
        onLearn={() => start("place-learn")}
        onPlay={() => start("place")}
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label="How big the numbers are">
          {PLACE_MAX.map((max) => (
            <Chip key={max} on={place.max === max} onClick={() => setPlace({ ...place, max })}>
              Up to {max}
            </Chip>
          ))}
          {roundSizes(place.questions, (n) => setPlace({ ...place, questions: n }), "questions")}
        </div>
      </ActivityCard>

      <MenuLink
        href="/dashboard/practice/kindergarten/sounds"
        emoji="🎤"
        title="Record the sounds"
        description="Record each letter sound the way the school teacher says it (m, a, p… k, a, t), and the activities will use your voice."
      />
      <MenuLink
        href="/dashboard/practice/kindergarten/worksheets"
        emoji="🖨️"
        title="Printable worksheets"
        description="Complete each word family, and match pictures to CVC words."
      />

      <SoundGuide />
      <VoiceChoice voice={voice} onChoose={choose} />
    </div>
  );
}
