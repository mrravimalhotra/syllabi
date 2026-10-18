import type { PracticeNumber } from "@/lib/practice/numbers";
import type { OrderQuestion } from "@/lib/practice/order";

export interface QuizResult {
  question: OrderQuestion;
  picked: PracticeNumber[];
  marks: boolean[];
  correct: boolean;
}
