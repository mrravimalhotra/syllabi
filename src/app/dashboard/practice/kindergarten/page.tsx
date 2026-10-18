"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CompareGame } from "@/components/kindergarten/CompareGame";
import { CvcGame } from "@/components/kindergarten/CvcGame";
import { SightGame } from "@/components/kindergarten/SightGame";
import { useSay, useVoiceChoice } from "@/components/kindergarten/useSay";
import { PageHeader, card, cx } from "@/components/ui";
import {
  DEFAULT_COMPARE,
  DEFAULT_CVC,
  DEFAULT_SIGHT,
  ROUND_SIZES,
  makeCompareQuiz,
  makeCvcQuiz,
  makeSightQuiz,
  type CompareSettings,
  type CvcSettings,
  type SightSettings,
} from "@/lib/kindergarten/quiz";
import { SIGHT_LEVEL_LABELS, VOWELS, type SightLevel, type Vowel } from "@/lib/kindergarten/words";
import { newSeed } from "@/lib/practice/random";
import { usePref } from "@/lib/use-pref";

type Activity = "cvc" | "sight" | "compare";

const isCvc = (v: unknown): v is CvcSettings => {
  const s = v as CvcSettings;
  return Boolean(s) && Array.isArray(s.vowels) && s.vowels.every((x) => (VOWELS as readonly string[]).includes(x)) && ROUND_SIZES.includes(s.questions as 5 | 10);
};
const isSight = (v: unknown): v is SightSettings => {
  const s = v as SightSettings;
  return Boolean(s) && (s.level === "pre-primer" || s.level === "primer") && ROUND_SIZES.includes(s.questions as 5 | 10);
};
const isCompare = (v: unknown): v is CompareSettings => {
  const s = v as CompareSettings;
  return Boolean(s) && [5, 10, 20].includes(s.max) && ROUND_SIZES.includes(s.questions as 5 | 10);
};

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "min-h-10 rounded-full border-2 px-4 text-sm font-medium transition-colors",
        on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      )}
    >
      {children}
    </button>
  );
}

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
  const { voice, choose } = useVoiceChoice();
  const { say, prepare, stop } = useSay();

  const start = (kind: Activity) => setActivity({ kind, seed: newSeed() });
  const exit = () => {
    stop();
    setActivity(null);
  };
  const again = () => setActivity((a) => (a ? { ...a, seed: newSeed() } : a));

  const cvcQuiz = useMemo(() => (activity?.kind === "cvc" ? makeCvcQuiz(cvc, activity.seed) : null), [activity, cvc]);
  const sightQuiz = useMemo(() => (activity?.kind === "sight" ? makeSightQuiz(sight, activity.seed) : null), [activity, sight]);
  const compareQuiz = useMemo(() => (activity?.kind === "compare" ? makeCompareQuiz(compare, activity.seed) : null), [activity, compare]);

  if (activity && cvcQuiz) return <CvcGame key={activity.seed} questions={cvcQuiz} say={say} prepare={prepare} onAgain={again} onExit={exit} />;
  if (activity && sightQuiz) return <SightGame key={activity.seed} questions={sightQuiz} say={say} prepare={prepare} onAgain={again} onExit={exit} />;
  if (activity && compareQuiz) return <CompareGame key={activity.seed} questions={compareQuiz} say={say} prepare={prepare} onAgain={again} onExit={exit} />;

  const toggleVowel = (v: Vowel) => {
    const has = cvc.vowels.includes(v);
    const next = has ? cvc.vowels.filter((x) => x !== v) : [...cvc.vowels, v];
    if (next.length > 0) setCvc({ ...cvc, vowels: VOWELS.filter((x) => next.includes(x)) });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Kindergarten"
        description="Short activities for little learners. Each is read aloud, uses pictures, and has no scores to fail: a wrong tap just says “try again”. Hand the phone to your child, and choose what to practise below."
      />
      <Link href="/dashboard/practice" className="text-sm font-medium text-brand-700 hover:underline">
        ← Back to Practice
      </Link>

      <section className={cx(card, "space-y-4 p-4 sm:p-6")}>
        <div className="flex items-start gap-4">
          <span className="text-5xl" aria-hidden>
            🐱
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Spell the word (CVC words)</h2>
            <p className="text-sm text-slate-500">See a picture, hear the word, tap the three letters in order: c-a-t, d-o-g, s-u-n.</p>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Vowel sounds to practise</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Vowel sounds to practise">
            {VOWELS.map((v) => (
              <Chip key={v} on={cvc.vowels.includes(v)} onClick={() => toggleVowel(v)}>
                {v} <span className="text-slate-400">as in {v === "a" ? "cat" : v === "e" ? "hen" : v === "i" ? "pig" : v === "o" ? "dog" : "sun"}</span>
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Questions in a round">
            {ROUND_SIZES.map((n) => (
              <Chip key={n} on={cvc.questions === n} onClick={() => setCvc({ ...cvc, questions: n })}>
                {n} words
              </Chip>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => start("cvc")} className="min-h-14 w-full rounded-2xl bg-brand-600 px-6 text-xl font-semibold text-white shadow-sm active:scale-95">
          ▶ Play
        </button>
      </section>

      <section className={cx(card, "space-y-4 p-4 sm:p-6")}>
        <div className="flex items-start gap-4">
          <span className="text-5xl" aria-hidden>
            👀
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Find the word (sight words)</h2>
            <p className="text-sm text-slate-500">Hear a common word like “the” or “you”, then find it among three words.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Which words">
          {(Object.keys(SIGHT_LEVEL_LABELS) as SightLevel[]).map((level) => (
            <Chip key={level} on={sight.level === level} onClick={() => setSight({ ...sight, level })}>
              {SIGHT_LEVEL_LABELS[level]}
            </Chip>
          ))}
          {ROUND_SIZES.map((n) => (
            <Chip key={n} on={sight.questions === n} onClick={() => setSight({ ...sight, questions: n })}>
              {n} words
            </Chip>
          ))}
        </div>
        <button type="button" onClick={() => start("sight")} className="min-h-14 w-full rounded-2xl bg-brand-600 px-6 text-xl font-semibold text-white shadow-sm active:scale-95">
          ▶ Play
        </button>
      </section>

      <section className={cx(card, "space-y-4 p-4 sm:p-6")}>
        <div className="flex items-start gap-4">
          <span className="text-5xl" aria-hidden>
            🍎
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">More, fewer or the same</h2>
            <p className="text-sm text-slate-500">Look at two groups of pictures and tap the one with more (or fewer), or “the same”.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="How big the groups are">
          {([5, 10, 20] as const).map((max) => (
            <Chip key={max} on={compare.max === max} onClick={() => setCompare({ ...compare, max })}>
              Up to {max}
            </Chip>
          ))}
          {ROUND_SIZES.map((n) => (
            <Chip key={n} on={compare.questions === n} onClick={() => setCompare({ ...compare, questions: n })}>
              {n} questions
            </Chip>
          ))}
        </div>
        <button type="button" onClick={() => start("compare")} className="min-h-14 w-full rounded-2xl bg-brand-600 px-6 text-xl font-semibold text-white shadow-sm active:scale-95">
          ▶ Play
        </button>
      </section>

      <section className={cx(card, "space-y-2 p-4 text-sm text-slate-600")}>
        <p className="font-medium text-slate-900">Voice</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Voice">
          <Chip on={voice === "natural"} onClick={() => choose("natural")}>
            Friendly voice
          </Chip>
          <Chip on={voice === "phone"} onClick={() => choose("phone")}>
            This phone&apos;s voice
          </Chip>
        </div>
        <p className="text-xs text-slate-500">
          The friendly voice is made by the app and may take a few seconds the first time a word is heard. If it isn&apos;t available, the phone&apos;s voice reads instead.
        </p>
      </section>
    </div>
  );
}
