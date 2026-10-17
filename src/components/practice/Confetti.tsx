"use client";

import { useEffect, useRef } from "react";

const COLOURS = ["#6366f1", "#f59e0b", "#10b981", "#ec4899", "#0ea5e9", "#facc15"];
const PIECES = 140;

/**
 * A short burst of confetti from the top of the screen each time `burst`
 * changes (and isn't 0). Skipped when the device asks for reduced motion.
 */
export function Confetti({ burst }: { burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!burst || !canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const [w, h] = [window.innerWidth, window.innerHeight];
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    ctx.scale(ratio, ratio);

    const pieces = Array.from({ length: PIECES }, () => ({
      x: w * (0.2 + Math.random() * 0.6),
      y: h * 0.25,
      vx: (Math.random() - 0.5) * 14,
      vy: -6 - Math.random() * 9,
      size: 5 + Math.random() * 6,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
    }));
    const started = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const t = (now - started) / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, 1 - t / 1.8);
      for (const p of pieces) {
        p.vy += 0.35;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < 1.8) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [burst]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[70] h-full w-full" aria-hidden="true" />;
}
