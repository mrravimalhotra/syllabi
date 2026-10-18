"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Confetti } from "@/components/practice/Confetti";
import { FeedbackSheet } from "@/components/practice/FeedbackSheet";
import { QuestionBoard } from "@/components/practice/QuestionBoard";
import { QuizHeader } from "@/components/practice/QuizHeader";
import { QuizResults } from "@/components/practice/QuizResults";
import type { QuizResult } from "@/components/practice/quiz-types";
import { playCorrect, playWrong } from "@/components/practice/sounds";
import { markOrder, type OrderQuestion } from "@/lib/practice/order";

const SOUND_KEY = "syllabi.practice.sound";

function readSoundSetting(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * A quiz on the whole screen (the menus hidden, so a child can be handed the
 * phone): tap the numbers in order, check, see what was right and why, then
 * a results screen.
 */
export function OrderQuiz({
  quiz,
  canPrint,
  onPrint,
  onExit,
  onNewQuiz,
  onRetry,
}: {
  quiz: OrderQuestion[];
  canPrint: boolean;
  onPrint: () => void;
  onExit: () => void;
  onNewQuiz: () => void;
  onRetry: (questions: OrderQuestion[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [feedback, setFeedback] = useState<QuizResult | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [burst, setBurst] = useState(0);
  const [sound, setSound] = useState(readSoundSetting);
  const feedbackTitle = useRef<HTMLParagraphElement>(null);
  const finished = results.length === quiz.length && !feedback;
  const q = quiz[index];

  // The page behind doesn't scroll while the quiz covers it.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const toggleSound = () => {
    setSound((on) => {
      try {
        localStorage.setItem(SOUND_KEY, on ? "off" : "on");
      } catch {
        // Not saved; the switch still works for this visit.
      }
      return !on;
    });
  };

  const exit = () => {
    const midway = !finished && (results.length > 0 || picked.length > 0);
    if (!midway || window.confirm("Leave this quiz? The answers so far won't be kept.")) onExit();
  };

  const check = () => {
    const answer = picked.map((i) => q.numbers[i]);
    const marks = markOrder(q, answer);
    const result = { question: q, picked: answer, marks, correct: marks.every(Boolean) };
    if (result.correct) {
      setBurst((b) => b + 1);
      if (sound) playCorrect();
    } else if (sound) playWrong();
    setResults((r) => [...r, result]);
    setFeedback(result);
    setShowWhy(!result.correct);
  };

  // Move focus to the result (keyboard and screen-reader users land on it; the sheet opens at the top).
  useEffect(() => {
    if (feedback) feedbackTitle.current?.focus({ preventScroll: true });
  }, [feedback]);

  const next = () => {
    setFeedback(null);
    setPicked([]);
    if (index < quiz.length - 1) setIndex(index + 1);
  };

  // Drawn on <body>, above the app's menus: an animated parent would otherwise trap a fixed layer inside the page.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-slate-50" role="dialog" aria-modal="true" aria-label="Practice quiz">
      <Confetti burst={burst} />
      <QuizHeader
        finished={finished}
        index={index}
        total={quiz.length}
        answered={results.length}
        sound={sound}
        onExit={exit}
        onToggleSound={toggleSound}
      />

      {finished ? (
        <QuizResults results={results} canPrint={canPrint} onPrint={onPrint} onNewQuiz={onNewQuiz} onRetry={onRetry} onExit={onExit} />
      ) : (
        <QuestionBoard
          q={q}
          picked={picked}
          locked={feedback !== null}
          onPick={(i) => setPicked((p) => [...p, i])}
          onTakeBack={(slot) => setPicked((p) => p.filter((_, k) => k !== slot))}
          onClear={() => setPicked([])}
          onCheck={check}
        />
      )}

      {feedback && (
        <FeedbackSheet
          feedback={feedback}
          index={index}
          total={quiz.length}
          showWhy={showWhy}
          onToggleWhy={() => setShowWhy((s) => !s)}
          onNext={next}
          titleRef={feedbackTitle}
        />
      )}
    </div>,
    document.body
  );
}
