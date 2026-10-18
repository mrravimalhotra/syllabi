"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { card, cx } from "@/components/ui";

/** One activity on the menu: a big picture, what it is, the grown-up's choices (children), and a Play button. */
export function ActivityCard({
  emoji,
  title,
  description,
  onPlay,
  children,
}: {
  emoji: string;
  title: string;
  description: string;
  onPlay: () => void;
  children?: ReactNode;
}) {
  return (
    <section className={cx(card, "space-y-4 p-4 sm:p-6")}>
      <div className="flex items-start gap-4">
        <span className="text-5xl" aria-hidden>
          {emoji}
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
      <button
        type="button"
        onClick={onPlay}
        className="min-h-14 w-full rounded-2xl bg-brand-600 px-6 text-xl font-semibold text-white shadow-sm active:scale-95"
      >
        ▶ Play
      </button>
    </section>
  );
}

/** A menu entry that opens another page. */
export function MenuLink({ href, emoji, title, description }: { href: string; emoji: string; title: string; description: string }) {
  return (
    <Link href={href} className={cx(card, "flex items-center gap-4 p-4 transition hover:border-brand-300 sm:p-5")}>
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <span>
        <span className="block text-base font-semibold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-500">{description}</span>
      </span>
      <span className="ml-auto text-slate-400" aria-hidden>
        →
      </span>
    </Link>
  );
}
