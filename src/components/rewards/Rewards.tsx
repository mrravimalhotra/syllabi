"use client";

import { useState } from "react";
import { Panda } from "@/components/mascot/Panda";
import { useEarnOnce, useRewards } from "@/components/rewards/useRewards";
import { STARS_PER_STICKER, dayOf, starsToNextSticker, stickersFor, streakOf } from "@/lib/rewards";

/** Today's date, read once when the component appears (reading the clock while drawing isn't allowed). */
function useToday() {
  const [today] = useState(() => dayOf(new Date()));
  return today;
}

/**
 * The child's star chart on a menu: stars, days in a row, and the sticker collection. `howToEarn` says how stars
 * are earned on this screen (games and quizzes unless told otherwise); `panda` is off where the panda is already shown.
 */
export function RewardsBar({ howToEarn = "Finish a game or quiz to earn stars.", panda = true }: { howToEarn?: string; panda?: boolean }) {
  const { stars, days } = useRewards();
  const today = useToday();
  const streak = streakOf(days, today);
  const stickers = stickersFor(stars);
  const toNext = starsToNextSticker(stars);
  return (
    <section
      className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-xs"
      aria-label="Stars and stickers"
    >
      {panda && <Panda mood="wave" className="h-16 w-14 shrink-0" />}
      <div className="min-w-0 flex-1 space-y-2">
        {stars === 0 ? (
          <p className="text-sm text-amber-900">
            ⭐ {howToEarn} Every {STARS_PER_STICKER} stars wins a sticker!
          </p>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-amber-900">
              <span>⭐ {stars} stars</span>
              {streak > 0 && (
                <span>
                  🔥 {streak} {streak === 1 ? "day" : "days in a row"}
                </span>
              )}
              {toNext !== null && <span className="font-normal text-amber-800">{toNext} more for the next sticker</span>}
            </p>
            {!panda && <p className="text-sm text-amber-900">{howToEarn}</p>}
            {stickers.length > 0 && (
              <p className="flex flex-wrap gap-1 text-2xl leading-none" aria-label={`${stickers.length} stickers collected`}>
                {stickers.map((s, i) => (
                  <span key={i} aria-hidden>
                    {s}
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** On a results screen: the stars just earned, any new sticker, and the streak. Adds the stars once. */
export function EarnedStars({ stars }: { stars: number }) {
  const [newStickers, setNewStickers] = useState<string[]>([]);
  useEarnOnce(stars, setNewStickers);
  const { days } = useRewards();
  const streak = streakOf(days, useToday());
  return (
    <div className="space-y-2 text-center" role="status">
      <p className="text-sm font-semibold text-amber-800">
        +{stars} {stars === 1 ? "star" : "stars"}
        {streak > 1 && <> · 🔥 {streak} days in a row</>}
      </p>
      {newStickers.length > 0 && (
        <div className="kg-pop inline-flex items-center gap-3 rounded-2xl bg-amber-100 px-4 py-2">
          <span className="text-4xl" aria-hidden>
            {newStickers.join(" ")}
          </span>
          <span className="text-sm font-semibold text-amber-900">New sticker{newStickers.length > 1 ? "s" : ""}!</span>
        </div>
      )}
    </div>
  );
}
