import type { CSSProperties } from "react";

const PIECES = ["⭐", "✨", "🎉", "💛", "🌟", "✨", "⭐", "💙", "🎈", "✨", "🌟", "💚"];

/** Stars and sparkles flying out from the middle of a right answer. Put it inside a `relative` element. */
export function Burst() {
  return (
    <span aria-hidden className="kg-burst pointer-events-none absolute inset-0 z-10">
      {PIECES.map((piece, i) => (
        <span
          key={i}
          className="text-2xl sm:text-3xl"
          style={
            {
              "--r": `${i * 30}deg`,
              "--d": `-${80 + (i % 3) * 28}px`,
              animationDelay: `${(i % 4) * 0.03}s`,
            } as CSSProperties
          }
        >
          {piece}
        </span>
      ))}
    </span>
  );
}
