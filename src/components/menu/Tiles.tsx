"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { card, cx } from "@/components/ui";

/** The colour behind a tile's picture; each menu gives its groups their own colour. */
const TILE = {
  sky: "bg-sky-100",
  amber: "bg-amber-100",
  slate: "bg-slate-100",
  violet: "bg-violet-100",
  emerald: "bg-emerald-100",
} as const;
export type Tone = keyof typeof TILE;

/** A group of tiles on a menu home, under its own heading. An odd last tile spans the row on narrow screens, so none sits alone. */
export function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2">{children}</div>
    </section>
  );
}

function Picture({ emoji, tone, size = "md" }: { emoji: string; tone: Tone; size?: "md" | "lg" }) {
  return (
    <span
      data-tone={tone}
      className={cx(
        "tile-picture flex shrink-0 items-center justify-center rounded-2xl",
        TILE[tone],
        size === "lg" ? "h-20 w-20 text-5xl" : "h-14 w-14 text-3xl"
      )}
      aria-hidden
    >
      {emoji}
    </span>
  );
}

interface TileProps {
  emoji: string;
  tone: Tone;
  title: string;
  /** One short line on what it is. */
  hint: string;
  /** What is chosen now, when the activity has choices. */
  chosen?: string;
  /** A small label in the corner ("Start here"). */
  badge?: string;
}

const TILE_CLASS = cx(
  card,
  "relative flex h-full flex-col items-start gap-2 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md active:scale-[0.98]"
);

function TileBody({ emoji, tone, title, hint, chosen, badge }: TileProps) {
  return (
    <>
      {badge && (
        <span className="absolute top-3 right-3 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">{badge}</span>
      )}
      <Picture emoji={emoji} tone={tone} />
      <span className="text-base leading-snug font-semibold text-slate-900">{title}</span>
      <span className="text-sm text-slate-500">{hint}</span>
      {chosen && <span className="mt-auto pt-1 text-xs font-medium text-brand-700">{chosen}</span>}
    </>
  );
}

/** A tile on a menu home that opens an activity's own screen. */
export function ActivityTile({ onOpen, ...props }: TileProps & { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={props.title} className={TILE_CLASS}>
      <TileBody {...props} />
    </button>
  );
}

/** A tile that opens another page (recording the sounds, worksheets). */
export function LinkTile({ href, ...props }: TileProps & { href: string }) {
  return (
    <Link href={href} aria-label={props.title} className={TILE_CLASS}>
      <TileBody {...props} />
    </Link>
  );
}

/** One activity's own screen: what it is, the grown-up's choices (children), and the big buttons to start. */
export function ActivityScreen({
  emoji,
  tone,
  title,
  description,
  onBack,
  backLabel = "← All activities",
  onPlay,
  onLearn,
  children,
}: {
  emoji: string;
  tone: Tone;
  title: string;
  description: string;
  onBack: () => void;
  backLabel?: string;
  /** Absent for screens with nothing to play (the grown-up's guide, the voice). */
  onPlay?: () => void;
  /** A lesson before the game, when the activity has one. */
  onLearn?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="animate-fade-in space-y-5">
      <button type="button" onClick={onBack} className="text-sm font-medium text-brand-700 hover:underline">
        {backLabel}
      </button>
      <section className={cx(card, "space-y-6 p-5 sm:p-7")} aria-label={title}>
        <div className="flex items-start gap-4">
          <Picture emoji={emoji} tone={tone} size="lg" />
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-600">{description}</p>
          </div>
        </div>
        {(onLearn || onPlay) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {onLearn && (
              <button
                type="button"
                onClick={onLearn}
                className="min-h-16 rounded-2xl border-4 border-brand-200 bg-white px-6 text-xl font-semibold text-brand-800 active:scale-95"
              >
                📖 Learn first
              </button>
            )}
            {onPlay && (
              <button
                type="button"
                onClick={onPlay}
                className={cx(
                  "min-h-16 rounded-2xl bg-brand-600 px-6 text-xl font-semibold text-white shadow-sm active:scale-95",
                  !onLearn && "sm:col-span-2"
                )}
              >
                ▶ Play
              </button>
            )}
          </div>
        )}
        {children && (
          <div className="space-y-5 border-t border-slate-100 pt-5">
            {(onLearn || onPlay) && <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Choose what to practise</p>}
            {children}
          </div>
        )}
      </section>
    </div>
  );
}
