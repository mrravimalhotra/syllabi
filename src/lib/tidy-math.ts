// The prompts ask the model for Unicode math (x², √, ≤), but models still slip
// into LaTeX now and then. This turns the common cases into readable Unicode so
// neither the screen nor the PDF shows raw "$\frac{1}{2}$"-style markup.

const SYMBOLS: Record<string, string> = {
  times: "×",
  div: "÷",
  pm: "±",
  mp: "∓",
  cdot: "·",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  infty: "∞",
  pi: "π",
  theta: "θ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  lambda: "λ",
  mu: "μ",
  sigma: "σ",
  Sigma: "Σ",
  omega: "ω",
  Omega: "Ω",
  phi: "φ",
  rho: "ρ",
  degree: "°",
  circ: "°",
  angle: "∠",
  perp: "⊥",
  parallel: "∥",
  therefore: "∴",
  because: "∵",
  rightarrow: "→",
  to: "→",
  Rightarrow: "⇒",
  leftrightarrow: "↔",
  in: "∈",
  sum: "∑",
  int: "∫",
  partial: "∂",
  sqrt: "√",
};

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", n: "ⁿ",
};

function superscript(s: string): string {
  return [...s].every((c) => c in SUPERSCRIPTS) ? [...s].map((c) => SUPERSCRIPTS[c]).join("") : `^(${s})`;
}

/** Converts common LaTeX math in `text` to plain Unicode; text without LaTeX passes through unchanged. */
export function tidyMath(text: string): string {
  if (!/[\\$]/.test(text)) return text;
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
    .replace(/\\\[([\s\S]+?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]+?)\\\)/g, "$1")
    .replace(/\$([^$\n]+?)\$/g, "$1")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:left|right)\s*/g, "")
    .replace(/\^\{([^{}]*)\}/g, (_, s: string) => superscript(s))
    .replace(/\^([0-9n])/g, (_, s: string) => superscript(s))
    .replace(/_\{([^{}]*)\}/g, "_$1")
    .replace(/\\([A-Za-z]+)/g, (match, name: string) => SYMBOLS[name] ?? match)
    .replace(/\\,|\\;|\\!/g, " ");
}
