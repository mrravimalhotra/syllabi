"use client";

import { IPA, PHONEMES, TEACHING_ORDER } from "@/lib/kindergarten/phonics";

/** How to say the sounds, for grown-ups: the method, then each sound with its symbol, picture word and mouth tip. */
export function SoundGuide() {
  return (
    <div className="text-sm text-slate-600">
      <div className="space-y-4">
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
          <li>
            The vowels are amber. Each has a picture word: a as in apple, e as in egg, i as in ink, o as in octopus, u as in umbrella.
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
          The app plays a pure sound for each letter, cut from a real word (m from &quot;map&quot;), with no letter name and no
          &quot;uh&quot;. To use the voice the child&apos;s school uses, record your own on the Record the sounds page: your recording is
          played instead. See <code>public/sounds/README.md</code>.
        </p>
      </div>
    </div>
  );
}
