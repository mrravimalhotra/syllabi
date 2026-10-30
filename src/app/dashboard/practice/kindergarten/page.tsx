"use client";

import { RewardsBar } from "@/components/rewards/Rewards";
import Link from "next/link";
import { useState } from "react";
import { ActivityTile, LinkTile, MenuGroup } from "@/components/menu/Tiles";
import { ActivityGame, type Activity } from "@/app/dashboard/practice/kindergarten/_parts/ActivityGame";
import { isCompare, isCvc, isPlace, isSight } from "@/app/dashboard/practice/kindergarten/_parts/prefs";
import { KindergartenScreen, SCREENS, type Screen } from "@/app/dashboard/practice/kindergarten/_parts/Screens";
import { summary } from "@/app/dashboard/practice/kindergarten/_parts/Settings";
import { useSay, useVoiceChoice } from "@/components/kindergarten/useSay";
import { useSoundEffects } from "@/components/practice/useSoundEffects";
import { PageHeader } from "@/components/ui";
import { DEFAULT_GAMES, isGames } from "@/lib/kindergarten/games";
import { DEFAULT_PLACE } from "@/lib/kindergarten/place-value";
import { DEFAULT_COMPARE, DEFAULT_CVC, DEFAULT_SIGHT } from "@/lib/kindergarten/quiz";
import { newSeed } from "@/lib/practice/random";
import { usePref } from "@/lib/use-pref";

/**
 * Kindergarten: short, picture-led activities for the youngest learners,
 * made entirely by code (no AI), read aloud to the child, with no scores to
 * fail. The home is a set of tiles; each opens the activity's own screen,
 * where the grown-up chooses what to practise and presses Play.
 */
export default function KindergartenPage() {
  const [activity, setActivity] = useState<{ kind: Activity; seed: number } | null>(null);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [cvc, setCvc] = usePref("syllabi-kg-cvc", DEFAULT_CVC, isCvc);
  const [sight, setSight] = usePref("syllabi-kg-sight", DEFAULT_SIGHT, isSight);
  const [compare, setCompare] = usePref("syllabi-kg-compare", DEFAULT_COMPARE, isCompare);
  const [place, setPlace] = usePref("syllabi-kg-place", DEFAULT_PLACE, isPlace);
  const [games, setGames] = usePref("syllabi-kg-games", DEFAULT_GAMES, isGames);
  const { voice, choose } = useVoiceChoice();
  const [soundsOn] = useSoundEffects();
  const speaker = useSay();

  const start = (kind: Activity) => setActivity({ kind, seed: newSeed() });
  // Leaving a game goes back to its screen, so it can be played again with one tap.
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
        games={games}
        voice={speaker}
        onAgain={again}
        onPlay={() => start("place")}
        onExit={exit}
      />
    );
  }

  if (screen) {
    return (
      <KindergartenScreen
        screen={screen}
        {...{ cvc, setCvc, sight, setSight, compare, setCompare, place, setPlace, games, setGames, voice }}
        chooseVoice={choose}
        start={start}
        onBack={() => setScreen(null)}
      />
    );
  }

  const tile = (id: Screen, chosen?: string) => {
    const { emoji, tone, title, hint, badge } = SCREENS[id];
    return <ActivityTile {...{ emoji, tone, title, hint, badge, chosen }} onOpen={() => setScreen(id)} />;
  };

  return (
    <div className="animate-fade-in space-y-7">
      <PageHeader
        title="Kindergarten"
        description="Short activities for little learners, read aloud, with pictures and no scores to fail: a wrong tap just says “try again”. Choose an activity, then hand the phone to your child."
      />
      <Link href="/dashboard/practice" className="block w-fit text-sm font-medium text-brand-700 hover:underline">
        ← Back to Practice
      </Link>

      <RewardsBar />

      <MenuGroup title="Letters and sounds">
        {tile("blend", summary.cvc(cvc))}
        {tile("cvc", summary.cvc(cvc))}
        {tile("missing", `${cvc.vowels.join(", ")} · ${summary.game("missing", games)}`)}
        {tile("explore", summary.cvc(cvc))}
        {tile("sight", summary.sight(sight))}
        {tile("read", summary.game("read", games))}
      </MenuGroup>

      <MenuGroup title="Numbers and patterns">
        {tile("count", summary.game("count", games))}
        {tile("compare", summary.compare(compare))}
        {tile("next", summary.game("next", games))}
        {tile("names", summary.game("names", games))}
        {tile("bonds", summary.game("bonds", games))}
        {tile("sums", summary.game("sums", games))}
        {tile("pattern", summary.game("pattern", games))}
        {tile("place", summary.place(place))}
      </MenuGroup>

      <MenuGroup title="For grown-ups">
        <LinkTile
          href="/dashboard/practice/kindergarten/sounds"
          emoji="🎤"
          tone="slate"
          title="Record the sounds"
          hint="Use your own voice, the way the school teacher says them"
        />
        <LinkTile
          href="/dashboard/practice/kindergarten/worksheets"
          emoji="🖨️"
          tone="slate"
          title="Printable worksheets"
          hint="Word families and picture matching"
        />
        {tile("guide")}
        {tile("voice", `${voice === "natural" ? "Friendly voice" : "This phone's voice"} · sounds ${soundsOn ? "on" : "off"}`)}
      </MenuGroup>
    </div>
  );
}
