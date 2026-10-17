// Worked examples: school maths methods (long division, LCM/HCF...) worked
// out step by step by code, with no AI, then drawn on a chalkboard grid and
// narrated. Every number comes from the computation, so it is always right.

/** What a cell shows, which sets its colour on the board. */
export type Tone = "given" | "quotient" | "product" | "remainder" | "carry" | "divisor" | "result" | "muted";

/** One character (or short number) in a grid cell. */
export interface Cell {
  row: number;
  col: number;
  text: string;
  tone?: Tone;
}

/** A horizontal line under a row, from the left edge of fromCol to the right edge of toCol. */
export interface Rule {
  row: number;
  fromCol: number;
  toCol: number;
}

/** A vertical line on the left edge of a column, from the top of fromRow to the bottom of toRow. */
export interface VLine {
  col: number;
  fromRow: number;
  toRow: number;
}

export interface Step {
  /** What the narrator says (plain text). */
  say: string;
  /** What appears on the board at this step (kept for later steps). */
  cells?: Cell[];
  rules?: Rule[];
  vlines?: VLine[];
  /** Cells to highlight during this step only. */
  focus?: { row: number; col: number }[];
}

/** A problem a worked example can solve, as saved with an answer. */
export type WorkedProblem =
  | { kind: "division"; dividend: string; divisor: string; decimals: boolean }
  | { kind: "lcm-hcf"; numbers: number[]; want: "lcm" | "hcf" | "both" }
  | { kind: "column"; op: "add" | "subtract"; numbers: string[] }
  | { kind: "multiplication"; a: string; b: string };

export interface WorkedExample {
  problem: WorkedProblem;
  title: string;
  /** Board size in cells. */
  rows: number;
  cols: number;
  /** Width of each column in characters (default 1): ladders keep whole numbers in one cell. */
  colWidths?: number[];
  steps: Step[];
  /** The final answer in one line, e.g. "5255 ÷ 5 = 1051". */
  answer: string;
}
