"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BlendGame } from "@/components/kindergarten/BlendGame";
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
  makeBlendQuiz,
  makeCompareQuiz,
  makeCvcQuiz,
  makeSightQuiz,
  type CompareSettings,
  type CvcSettings,
  type SightSettings,
} from "@/lib/kindergarten/quiz";
import { IPA, PHONEMES, TEACHING_ORDER } from "@/lib/kindergarten/phonics";
import { SIGHT_LEVELS, SIGHT_LEVEL_LABELS, VOWELS, type Vowel } from "@/lib/kindergarten/words";
import { newSeed } from "@/lib/practice/random";
import { usePref } from "@/lib/use-pref";

type Activity = "blend" | "cvc" | "sight" | "compare";

const isCvc = (v: unknown): v is CvcSettings => {
  const s = v as CvcSettings;
  return (
    Boolean(s) &&
    Array.isArray(s.vowels) &&
    s.vowels.every((x) => (VOWELS as readonly string[]).includes(x)) &&
    ROUND_SIZES.includes(s.questions as 5 | 10)
  );
};
const isSight = (v: unknown): v is SightSettings => {
  const s = v as SightSettings;
  return Boolean(s) && (SIGHT_LEVELS as string[]).includes(s.level) && ROUND_SIZES.includes(s.questions as 5 | 10);
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
  const { say, sound, prepare, prepareSounds, stop } = useSay();

  const start = (kind: Activity) => setActivity({ kind, seed: newSeed() });
  const exit = () => {
    stop();
    setActivity(null);
  };
  const again = () => setActivity((a) => (a ? { ...a, seed: newSeed() } : a));

  const blendQuiz = useMemo(() => (activity?.kind === "blend" ? makeBlendQuiz(cvc, activity.seed) : null), [activity, cvc]);
  const cvcQuiz = useMemo(() => (activity?.kind === "cvc" ? makeCvcQuiz(cvc, activity.seed) : null), [activity, cvc]);
  const sightQuiz = useMemo(() => (activity?.kind === "sight" ? makeSightQuiz(sight, activity.seed) : null), [activity, sight]);
  const compareQuiz = useMemo(() => (activity?.kind === "compare" ? makeCompareQuiz(compare, activity.seed) : null), [activity, compare]);

  if (activity && blendQuiz)
    return (
      <BlendGame
        key={activity.seed}
        questions={blendQuiz}
        say={say}
        sound={sound}
        prepare={prepare}
        prepareSounds={prepareSounds}
        onAgain={again}
        onExit={exit}
      />
    );
  if (activity && cvcQuiz)
    return (
      <CvcGame
        key={activity.seed}
        questions={cvcQuiz}
        say={say}
        sound={sound}
        prepare={prepare}
        prepareSounds={prepareSounds}
        onAgain={again}
        onExit={exit}
      />
    );
  if (activity && sightQuiz)
    return <SightGame key={activity.seed} questions={sightQuiz} say={say} prepare={prepare} onAgain={again} onExit={exit} />;
  if (activity && compareQuiz)
    return <CompareGame key={activity.seed} questions={compareQuiz} say={say} prepare={prepare} onAgain={again} onExit={exit} />;

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
            👂
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Listen and blend</h2>
            <p className="text-sm text-slate-500">
              Start here. Hear the sounds of a word one at a time (m… a… p…), put them together, and tap the picture. Uses the same vowels
              as Spell the word below.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => start("blend")}
          className="min-h-14 w-full rounded-2xl bg-brand-600 px-6 text-xl font-semibold text-white shadow-sm active:scale-95"
        >
          ▶ Play
        </button>
      </section>

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
                {v}{" "}
                <span className="text-slate-400">
                  as in {v === "a" ? "cat" : v === "e" ? "hen" : v === "i" ? "pig" : v === "o" ? "dog" : "sun"}
                </span>
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
        <button
          type="button"
          onClick={() => start("cvc")}
          className="min-h-14 w-full rounded-2xl bg-brand-600 px-6 text-xl font-semibold text-white shadow-sm active:scale-95"
        >
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
          {SIGHT_LEVELS.map((level) => (
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
        <button
          type="button"
          onClick={() => start("sight")}
          className="min-h-14 w-full rounded-2xl bg-brand-600 px-6 text-xl font-semibold text-white shadow-sm active:scale-95"
        >
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
        <button
          type="button"
          onClick={() => start("compare")}
          className="min-h-14 w-full rounded-2xl bg-brand-600 px-6 text-xl font-semibold text-white shadow-sm active:scale-95"
        >
          ▶ Play
        </button>
      </section>

      <Link
        href="/dashboard/practice/kindergarten/sounds"
        className={cx(card, "flex items-center gap-4 p-4 transition hover:border-brand-300 sm:p-5")}
      >
        <span className="text-4xl" aria-hidden>
          🎤
        </span>
        <span>
          <span className="block text-base font-semibold text-slate-900">Record the sounds</span>
          <span className="block text-sm text-slate-500">
            Record each letter sound the way the school teacher says it (m, a, p… k, a, t), and the activities will use your voice.
          </span>
        </span>
        <span className="ml-auto text-slate-400" aria-hidden>
          →
        </span>
      </Link>

      <Link
        href="/dashboard/practice/kindergarten/worksheets"
        className={cx(card, "flex items-center gap-4 p-4 transition hover:border-brand-300 sm:p-5")}
      >
        <span className="text-4xl" aria-hidden>
          🖨️
        </span>
        <span>
          <span className="block text-base font-semibold text-slate-900">Printable worksheets</span>
          <span className="block text-sm text-slate-500">Complete each word family, and match pictures to CVC words.</span>
        </span>
        <span className="ml-auto text-slate-400" aria-hidden>
          →
        </span>
      </Link>

      <details className={cx(card, "p-4 text-sm text-slate-600 sm:p-5")}>
        <summary className="cursor-pointer text-base font-semibold text-slate-900">How to say the sounds (for grown-ups)</summary>
        <div className="mt-3 space-y-4">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Say the <strong>sound</strong> a letter makes, not its name: <strong>m</strong> says “mmm”, not “em”.
            </li>
            <li>
              <strong>Sounds you can hold</strong> (m, s, f, n, l, r, v, z) can be stretched: “mmmm”. <strong>Quick sounds</strong> (b, d,
              g, k, p, t…) can&apos;t be held, so say them short and clipped with no extra “uh”: “b”, not “buh”.
            </li>
            <li>
              To blend, use three steps. <strong>1. Segment:</strong> touch each letter and say its sound (m… a… p…).{" "}
              <strong>2. Slide:</strong> join the first two sounds (“ma…”). <strong>3. Finish:</strong> add the last sound and slide a
              finger under the whole word: “map”.
            </li>
            <li>
              The vowels are red. Each has a picture word: a as in apple, e as in egg, i as in ink, o as in octopus, u as in umbrella.
            </li>
          </ul>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {Object.entries(PHONEMES)
              .filter(([letter]) => TEACHING_ORDER.indexOf(letter) < 20)
              .map(([letter, p]) => (
                <p key={letter}>
                  <span className="mr-1 inline-block w-5 text-base font-bold text-slate-900">{letter}</span>
                  <span className="mr-1 text-xs font-medium text-brand-700">/{IPA[letter]}/</span>
                  <span aria-hidden>{p.keyword.emoji}</span>{" "}
                  <span className="text-xs text-slate-500">
                    {p.keyword.word}: {p.tip}
                  </span>
                </p>
              ))}
          </div>
          <p className="text-xs text-slate-500">
            The app&apos;s voice can only approximate a pure sound. For the clearest sounds, record your own voice saying each one (or use a
            recording you have) and add the files as <code>/sounds/m.mp3</code>, <code>/sounds/a.mp3</code> and so on. The app plays a
            recording whenever one exists. See <code>public/sounds/README.md</code>.
          </p>
        </div>
      </details>

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
          The friendly voice is made by the app and may take a few seconds the first time a word is heard. If it isn&apos;t available, the
          phone&apos;s voice reads instead.
        </p>
      </section>
    </div>
  );
}
