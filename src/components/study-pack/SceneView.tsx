import type { Scene, SceneBackdrop } from "@/lib/study-pack/types";
import { cx } from "@/components/ui";

// Backdrop colours: the sky/ground of each scene, drawn with plain gradients.
const BACKDROPS: Record<SceneBackdrop, { sky: string; ground: string }> = {
  sky: { sky: "linear-gradient(#bae6fd, #e0f2fe)", ground: "#86efac" },
  forest: { sky: "linear-gradient(#d9f99d, #ecfccb)", ground: "#4ade80" },
  ocean: { sky: "linear-gradient(#7dd3fc, #38bdf8)", ground: "#0ea5e9" },
  night: { sky: "linear-gradient(#312e81, #1e1b4b)", ground: "#4338ca" },
  desert: { sky: "linear-gradient(#fde68a, #fef3c7)", ground: "#fbbf24" },
  village: { sky: "linear-gradient(#bfdbfe, #dbeafe)", ground: "#a3e635" },
  city: { sky: "linear-gradient(#cbd5e1, #e2e8f0)", ground: "#94a3b8" },
  classroom: { sky: "linear-gradient(#fef3c7, #fffbeb)", ground: "#d6b88a" },
  mountain: { sky: "linear-gradient(#c7d2fe, #e0e7ff)", ground: "#a8a29e" },
  temple: { sky: "linear-gradient(#fed7aa, #ffedd5)", ground: "#fdba74" },
  space: { sky: "linear-gradient(#1e1b4b, #020617)", ground: "#312e81" },
  lab: { sky: "linear-gradient(#ccfbf1, #f0fdfa)", ground: "#5eead4" },
};

const DARK: SceneBackdrop[] = ["night", "space"];

/**
 * A small animated picture for a walkthrough part. It only ever shows emoji
 * and fixed motions chosen from lists, so nothing from the AI is run. It moves
 * faster while the part is being read aloud, and stays still for people who
 * ask their phone to reduce motion.
 */
export function SceneView({ scene, speaking }: { scene: Scene; speaking: boolean }) {
  const colours = BACKDROPS[scene.backdrop];
  const count = scene.actors.length;
  return (
    <figure className="print:hidden">
      <div
        className={cx("relative h-40 overflow-hidden rounded-2xl border border-slate-200 sm:h-48", speaking && "scene-lively")}
        style={{ background: colours.sky }}
        role="img"
        aria-label={scene.caption || "An animated picture for this part"}
      >
        {DARK.includes(scene.backdrop) && <span className="absolute top-3 right-6 text-lg opacity-80" aria-hidden>✨</span>}
        <div className="absolute inset-x-0 bottom-0 h-1/4" style={{ background: colours.ground }} aria-hidden />
        {scene.actors.map((actor, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute bottom-[14%] -translate-x-1/2 text-5xl leading-none sm:text-6xl"
            style={{ left: `${((i + 0.5) / count) * 100}%` }}
          >
            <span
              className={cx("scene-actor block", `scene-${actor.motion}`)}
              style={{ animationDelay: `${i * -0.7}s`, ["--scene-seconds" as string]: `${2.4 + (i % 3) * 0.6}s` }}
            >
              {actor.emoji}
            </span>
          </span>
        ))}
      </div>
      {scene.caption && <figcaption className="mt-1.5 text-center text-xs text-slate-500">{scene.caption}</figcaption>}
    </figure>
  );
}
