"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

export type MenuItem = { label: string; danger?: boolean } & ({ href: string } | { onSelect: () => void });

/** A row's "⋯" menu: its less-used actions, out of the way of the tick (and of a mis-tap on Remove). */
export function RowMenu({ label, items, note }: { label: string; items: MenuItem[]; note?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const item = "block w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50";
  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((i) =>
            "href" in i ? (
              <Link key={i.label} role="menuitem" href={i.href} className={cx(item, "text-slate-700")}>
                {i.label}
              </Link>
            ) : (
              <button
                key={i.label}
                type="button"
                role="menuitem"
                className={cx(item, i.danger ? "text-red-600" : "text-slate-700")}
                onClick={() => {
                  setOpen(false);
                  i.onSelect();
                }}
              >
                {i.label}
              </button>
            )
          )}
          {note && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{note}</p>}
        </div>
      )}
    </div>
  );
}
