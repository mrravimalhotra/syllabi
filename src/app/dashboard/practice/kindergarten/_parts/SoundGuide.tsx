"use client";

import { IPA, PHONEMES, TEACHING_ORDER } from "@/lib/kindergarten/phonics";
import { card, cx } from "@/components/ui";

/** "How to say the sounds (for grown-ups)": the method, then each sound with its symbol, picture word and mouth tip. */
export function SoundGuide() {
  return (
    <details className={cx(card, "p-4 text-sm text-slate-600 sm:p-5")}>
      <summary className="cursor-pointer text-base font-semibold text-slate-900">How to say the sounds (for grown-ups)</summary>
      <div className="mt-3 space-y-4">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Say the <strong>sound</strong> a letter makes, not its name: <strong>m</strong> says “mmm”, not “em”.
          </li>
          <li>
            <strong>Sounds you can hold</strong> (m, s, f, n, l, r, v, z) can be stretched: “mmmm”. <strong>Quick sounds</strong> (b, d, g,
            k, p, t…) can&apos;t be held, so say them short and clipped with no extra “uh”: “b”, not “buh”.
          </li>
          <li>
            To blend, use three steps. <strong>1. Segment:</strong> touch each letter and say its sound (m… a… p…).{" "}
            <strong>2. Slide:</strong> join the first two sounds (“ma…”). <strong>3. Finish:</strong> add the last sound and slide a finger
            under the whole word: “map”.
          </li>
          <li>The vowels are red. Each has a picture word: a as in apple, e as in egg, i as in ink, o as in octopus, u as in umbrella.</li>
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
  );
}
