import type { Student } from "@/types/database";

export const CLASS_LEVELS = [
  "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6",
  "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12",
];
export const BOARDS = ["CBSE", "ICSE", "State board", "IB", "IGCSE", "Other"];

/** One line for the prompt saying who the material is for, from the Account page; empty if not set. */
export function levelLine(student: Pick<Student, "class_level" | "board">): string {
  const parts = [student.class_level, student.board && student.board !== "Other" ? `${student.board} board` : null].filter(Boolean);
  if (!parts.length) return "";
  return `The student is in ${parts.join(", ")}: pitch vocabulary, depth and answer length for that level and follow that board's exam conventions.`;
}
