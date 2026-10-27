"use client";

import { VolumeIcon, VolumeOffIcon, XIcon } from "@/components/icons";
import { GamePanda } from "@/components/mascot/Panda";
import { ThemeToggle } from "@/components/ThemeToggle";
import { button } from "@/components/ui";

interface Props {
  finished: boolean;
  index: number;
  total: number;
  /** Questions answered so far, for the progress bar. */
  answered: number;
  sound: boolean;
  onExit: () => void;
  onToggleSound: () => void;
}

/** The bar on top of the quiz: leave, which question this is, the sound switch, and the progress bar. */
export function QuizHeader({
  finished,
  index,
  total,
  answered,
  sound,
  onExit,
  onToggleSound,
}: Props) {
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onExit}
          className={button.icon}
          aria-label="Leave the quiz"
        >
          <XIcon className="h-5 w-5" />
        </button>
        <p
          className="flex-1 text-center text-sm font-medium text-slate-700"
          aria-live="polite"
        >
          {finished ? "All done" : `Question ${index + 1} of ${total}`}
        </p>
        <GamePanda />
        <ThemeToggle />
        <button
          type="button"
          onClick={onToggleSound}
          className={button.icon}
          aria-label={sound ? "Turn sound off" : "Turn sound on"}
          aria-pressed={sound}
        >
          {sound ? (
            <VolumeIcon className="h-5 w-5" />
          ) : (
            <VolumeOffIcon className="h-5 w-5" />
          )}
        </button>
      </div>
      <div className="h-1.5 bg-slate-100">
        <div
          className="h-full bg-brand-500 transition-all"
          style={{ width: `${(answered / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
