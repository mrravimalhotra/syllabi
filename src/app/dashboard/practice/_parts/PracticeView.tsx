"use client";

import { useState } from "react";
import { OrderPractice } from "@/app/dashboard/practice/_parts/OrderPractice";
import { ActivityScreen, ActivityTile, LinkTile, MenuGroup, type Tone } from "@/components/menu/Tiles";
import { TUTORIALS, TutorialsCard } from "@/components/practice/TutorialsCard";
import { PageHeader } from "@/components/ui";
import { describe, presetFor, type OrderSettings } from "@/lib/practice/order";

/** The picture and one-line hint on each tutorial's tile, and the line under its title. */
const TUTORIAL_TILES: Record<string, { emoji: string; hint: string; description: string }> = {
  division: {
    emoji: "➗",
    hint: "Divide, step by step",
    description: "Divide one number by another step by step, stopping with a remainder or carrying on into decimals.",
  },
  "lcm-hcf": {
    emoji: "🪜",
    hint: "The ladder method",
    description: "Find the LCM and HCF of 2 to 6 whole numbers with the ladder (division) method.",
  },
  add: {
    emoji: "➕",
    hint: "Carry across columns",
    description: "Add 2 to 4 numbers in columns, carrying tens to the next column. Decimals are fine.",
  },
  subtract: {
    emoji: "➖",
    hint: "Borrow from the next column",
    description: "Take one number from another in columns, borrowing from the next column when needed.",
  },
  multiply: {
    emoji: "✖️",
    hint: "One digit at a time, then add",
    description: "Multiply by each digit of the second number in turn, then add the rows.",
  },
  fractions: {
    emoji: "🍕",
    hint: "Add, take away, simplify",
    description: "Work with fractions step by step: common bottoms, the working, and the simplest form.",
  },
  units: {
    emoji: "📏",
    hint: "km, m, cm · kg, g · l, ml",
    description: "Change between metric units of length, mass and capacity on a place-value chart.",
  },
};
const TUTORIAL_TONE: Tone = "violet";

type Screen = { kind: "order" } | { kind: "tutorial"; id: string };

/**
 * Practice: quizzes and maths tutorials worked out entirely by code (no AI).
 * The home is a set of tiles; each opens its own screen. The ordering quiz's
 * level starts from the child's class, which comes from the server with the
 * page, so nothing waits on a second request.
 */
export function PracticeView({ classLevel }: { classLevel: string | null }) {
  const [screen, setScreen] = useState<Screen | null>(null);
  // Kept here, so the choices stay when the quiz's screen is left and opened again.
  const [order, setOrder] = useState<OrderSettings>(() => presetFor("whole", classLevel));
  const back = { onBack: () => setScreen(null), backLabel: "← All practice" };

  if (screen?.kind === "order") {
    return (
      <ActivityScreen
        emoji="🔢"
        tone="amber"
        title="Put the numbers in order"
        description={`Each question has ${order.size} numbers to arrange from smallest to biggest, or biggest to smallest.`}
        {...back}
      >
        <OrderPractice settings={order} setSettings={setOrder} classLevel={classLevel} />
      </ActivityScreen>
    );
  }
  if (screen?.kind === "tutorial") {
    const label = TUTORIALS.find((t) => t.id === screen.id)?.label ?? "Maths tutorial";
    const tile = TUTORIAL_TILES[screen.id];
    return (
      <ActivityScreen emoji={tile?.emoji ?? "📐"} tone={TUTORIAL_TONE} title={label} description={tile?.description ?? ""} {...back}>
        <p className="text-sm text-slate-600">
          Type the numbers, or tap &ldquo;Give me an example&rdquo;, and watch it worked out step by step on the chalkboard, read aloud.
        </p>
        <TutorialsCard topic={screen.id} />
      </ActivityScreen>
    );
  }

  return (
    <div className="animate-fade-in space-y-7">
      <PageHeader
        title="Practice"
        description="Quizzes and maths tutorials for your child, worked out by the app itself: always correct, and no AI used."
      />
      <MenuGroup title="Practise">
        <LinkTile
          href="/dashboard/practice/kindergarten"
          emoji="🧸"
          tone="sky"
          title="Kindergarten"
          hint="Letter sounds, spelling, sight words and counting, read aloud"
        />
        <ActivityTile
          emoji="🔢"
          tone="amber"
          title="Put the numbers in order"
          hint="Smallest to biggest, or biggest to smallest"
          chosen={describe(order)}
          onOpen={() => setScreen({ kind: "order" })}
        />
      </MenuGroup>
      <MenuGroup title="Step-by-step maths tutorials">
        {TUTORIALS.map((t) => (
          <ActivityTile
            key={t.id}
            emoji={TUTORIAL_TILES[t.id]?.emoji ?? "📐"}
            tone={TUTORIAL_TONE}
            title={t.label}
            hint={TUTORIAL_TILES[t.id]?.hint ?? "Worked out on the chalkboard"}
            onOpen={() => setScreen({ kind: "tutorial", id: t.id })}
          />
        ))}
      </MenuGroup>
    </div>
  );
}
