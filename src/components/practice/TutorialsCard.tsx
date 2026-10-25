"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CheckIcon, SparklesIcon } from "@/components/icons";
import { Field, button, card, cx, input, link } from "@/components/ui";
import { WorkedExampleView } from "@/components/worked/WorkedExampleView";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import { cleanNumber } from "@/lib/worked/division";
import { solve } from "@/lib/worked/detect";
import type { WorkedExample, WorkedProblem } from "@/lib/worked/types";

type Values = Record<string, string>;

interface InputField {
  key: string;
  label: string;
  /** One line under the field saying what is accepted. */
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Hidden when another field has a given value (e.g. the second fraction when simplifying). */
  hiddenWhen?: (v: Values) => boolean;
}

interface Topic {
  id: string;
  label: string;
  fields: InputField[];
  /** The problem from what was typed, or what is wrong with it. */
  problem: (v: Values) => WorkedProblem | string;
  example: () => Values;
}

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T,>(items: T[]) => items[rand(0, items.length - 1)];

/** Whole or decimal numbers typed with commas or spaces between them. */
function numberList(text: string): string[] | null {
  const parts = text.split(/[,;\s]+(?:and\s+)?|\s+and\s+/i).filter(Boolean);
  const numbers = parts.map((p) => cleanNumber(p));
  return numbers.every((n): n is string => n !== null) ? numbers : null;
}

function fractionOf(text: string): [number, number] | null {
  const m = /^\s*(\d{1,5})\s*\/\s*(\d{1,5})\s*$/.exec(text);
  return m && Number(m[2]) > 0 ? [Number(m[1]), Number(m[2])] : null;
}

const UNITS = [
  { family: "Length", units: ["km", "hm", "dam", "m", "dm", "cm", "mm"] },
  { family: "Mass", units: ["kg", "hg", "dag", "g", "dg", "cg", "mg"] },
  { family: "Capacity", units: ["kl", "hl", "dal", "l", "dl", "cl", "ml"] },
];
const UNIT_OPTIONS = UNITS.flatMap((f) => f.units.map((u) => ({ value: u, label: `${u} (${f.family.toLowerCase()})` })));
const familyOf = (unit: string) => UNITS.find((f) => f.units.includes(unit))?.family;

const TOPICS: Topic[] = [
  {
    id: "division",
    label: "Long division",
    fields: [
      { key: "dividend", label: "Number to divide", placeholder: "e.g. 945" },
      { key: "divisor", label: "Divide by", placeholder: "e.g. 7" },
      {
        key: "decimals",
        label: "If it doesn't divide exactly",
        options: [
          { value: "no", label: "Stop with a remainder" },
          { value: "yes", label: "Carry on into decimals" },
        ],
      },
    ],
    problem: (v) => {
      const dividend = cleanNumber(v.dividend ?? "");
      const divisor = cleanNumber(v.divisor ?? "");
      if (!dividend || !divisor) return "Type the number to divide and the number to divide by.";
      if (Number(divisor) === 0) return "You can't divide by 0.";
      return { kind: "division", dividend, divisor, decimals: v.decimals === "yes" };
    },
    example: () => ({ dividend: String(rand(100, 9999)), divisor: String(pick([3, 4, 5, 6, 7, 8, 9, 12, 15, 24])), decimals: "no" }),
  },
  {
    id: "lcm-hcf",
    label: "LCM and HCF",
    fields: [
      {
        key: "numbers",
        label: "Numbers to find the LCM or HCF of",
        hint: "Type 2 to 6 whole numbers, separated by commas. Write big numbers without commas (1000, not 1,000).",
        placeholder: "e.g. 12, 18, 30",
      },
      {
        key: "want",
        label: "Find",
        options: [
          { value: "both", label: "HCF and LCM" },
          { value: "lcm", label: "LCM only" },
          { value: "hcf", label: "HCF only" },
        ],
      },
    ],
    problem: (v) => {
      const numbers = numberList(v.numbers ?? "")?.map(Number);
      if (!numbers || numbers.length < 2) return "Type at least two whole numbers separated by commas, for example 12, 18, 30.";
      if (numbers.some((n) => !Number.isInteger(n) || n < 1)) return "LCM and HCF need whole numbers above 0.";
      return { kind: "lcm-hcf", numbers, want: (v.want as "lcm" | "hcf" | "both") ?? "both" };
    },
    example: () => {
      const pool = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 24, 27, 28, 30, 32, 36, 40, 42, 45, 48, 60];
      const chosen = new Set<number>();
      const count = rand(2, 3);
      while (chosen.size < count) chosen.add(pick(pool));
      return { numbers: [...chosen].join(", "), want: "both" };
    },
  },
  {
    id: "add",
    label: "Column addition",
    fields: [
      {
        key: "numbers",
        label: "Numbers to add",
        hint: "Type 2 to 4 numbers, separated by commas. Decimals are fine. Write big numbers without commas (4567, not 4,567).",
        placeholder: "e.g. 4567, 789",
      },
    ],
    problem: (v) => {
      const numbers = numberList(v.numbers ?? "");
      if (!numbers || numbers.length < 2)
        return "Type two to four numbers separated by commas, for example 4567, 789. Check that each one is a number.";
      return { kind: "column", op: "add", numbers };
    },
    example: () => ({ numbers: Array.from({ length: rand(2, 3) }, () => rand(100, 9999)).join(", ") }),
  },
  {
    id: "subtract",
    label: "Column subtraction",
    fields: [
      { key: "a", label: "Take away from", placeholder: "e.g. 6008" },
      { key: "b", label: "Number to take away", placeholder: "e.g. 49" },
    ],
    problem: (v) => {
      const a = cleanNumber(v.a ?? "");
      const b = cleanNumber(v.b ?? "");
      if (!a || !b) return "Type both numbers.";
      return { kind: "column", op: "subtract", numbers: [a, b] };
    },
    example: () => {
      // Often a zero in the middle, to show borrowing across it.
      const a = Math.random() < 0.4 ? rand(1, 9) * 1000 + rand(1, 9) : rand(1000, 9999);
      return { a: String(a), b: String(rand(12, Math.min(999, a - 1))) };
    },
  },
  {
    id: "multiply",
    label: "Long multiplication",
    fields: [
      { key: "a", label: "Number", placeholder: "e.g. 234" },
      { key: "b", label: "Multiply by", placeholder: "e.g. 56" },
    ],
    problem: (v) => {
      const a = cleanNumber(v.a ?? "");
      const b = cleanNumber(v.b ?? "");
      if (!a || !b) return "Type both numbers.";
      return { kind: "multiplication", a, b };
    },
    example: () => ({ a: String(rand(100, 999)), b: String(rand(12, 99)) }),
  },
  {
    id: "fractions",
    label: "Fractions",
    fields: [
      {
        key: "op",
        label: "Do",
        options: [
          { value: "add", label: "Add two fractions" },
          { value: "subtract", label: "Subtract two fractions" },
          { value: "simplify", label: "Simplify a fraction" },
        ],
      },
      { key: "first", label: "Fraction", placeholder: "e.g. 3/4" },
      { key: "second", label: "Second fraction", placeholder: "e.g. 1/6", hiddenWhen: (v) => v.op === "simplify" },
    ],
    problem: (v) => {
      const op = (v.op as "add" | "subtract" | "simplify") ?? "add";
      const first = fractionOf(v.first ?? "");
      if (!first) return "Type the fraction like 3/4.";
      if (op === "simplify") return { kind: "fraction", op, fractions: [first] };
      const second = fractionOf(v.second ?? "");
      if (!second) return "Type the second fraction like 1/6.";
      return { kind: "fraction", op, fractions: [first, second] };
    },
    example: () => {
      const op = pick(["add", "subtract", "simplify"]);
      const fraction = () => {
        const d = rand(2, 12);
        return `${rand(1, d - 1)}/${d}`;
      };
      if (op === "simplify") {
        const k = rand(2, 6);
        const d = rand(2, 9);
        return { op, first: `${rand(1, d - 1) * k}/${d * k}`, second: "" };
      }
      const [x, y] = [fraction(), fraction()];
      // Subtract the smaller from the bigger, as school examples do.
      const value = (f: string) => Number(f.split("/")[0]) / Number(f.split("/")[1]);
      return op === "subtract" && value(x) < value(y) ? { op, first: y, second: x } : { op, first: x, second: y };
    },
  },
  {
    id: "units",
    label: "Metric conversion",
    fields: [
      { key: "value", label: "Amount", placeholder: "e.g. 3.45" },
      { key: "from", label: "From", options: UNIT_OPTIONS },
      { key: "to", label: "To", options: UNIT_OPTIONS },
    ],
    problem: (v) => {
      const value = cleanNumber(v.value ?? "");
      if (!value) return "Type the amount to convert.";
      if (!v.from || !v.to || v.from === v.to) return "Choose two different units.";
      if (familyOf(v.from) !== familyOf(v.to))
        return `${v.from} and ${v.to} measure different things; choose two units of ${familyOf(v.from)?.toLowerCase()}.`;
      return { kind: "convert", value, from: v.from, to: v.to };
    },
    example: () => {
      // Common school conversions: big unit → base unit, or back (km ↔ m, m ↔ cm, kg ↔ g, l ↔ ml...).
      const family = pick(UNITS);
      const [big, base, small] = [family.units[0], family.units[3], pick([family.units[5], family.units[6]])];
      const [from, to] = pick([
        [big, base],
        [base, big],
        [base, small],
        [small, base],
      ]);
      const value =
        from === big || (from === base && to === small)
          ? pick(["3.45", "2.5", "0.75", "12", "6.08"])
          : pick(["2500", "450", "75", "1200", "4050"]);
      return { value, from, to };
    },
  },
];

/** Why a worked example can't be drawn for this problem, in words the parent can act on. */
function tooLargeMessage(p: WorkedProblem): string {
  switch (p.kind) {
    case "lcm-hcf":
      return p.numbers.length > 6
        ? `That is ${p.numbers.length} numbers; the ladder method here handles up to 6. Remove some and try again.`
        : "LCM and HCF work with whole numbers up to 1,000,000. Use smaller numbers.";
    case "column":
      return p.numbers.length > 4
        ? `That is ${p.numbers.length} numbers; column addition here handles up to 4. Remove some and try again.`
        : "Column sums here handle numbers of up to 12 digits in total. Use smaller numbers.";
    case "division":
      return "Long division here handles a number of up to 12 digits divided by a number of up to 6 digits. Use smaller numbers.";
    case "multiplication":
      return "Long multiplication here handles a first number of up to 8 digits and a second of up to 4 digits (the decimal point doesn't count). Use smaller numbers.";
    case "fraction":
      return "Fractions here handle tops and bottoms up to 100,000. Use smaller numbers.";
    case "convert":
      return "That amount has too many digits (up to 10 are allowed). Use a shorter number.";
  }
}

/** The methods, for a menu of tiles: each opens the card on that method alone. */
export const TUTORIALS: { id: string; label: string }[] = TOPICS.map(({ id, label }) => ({ id, label }));

const DEFAULTS: Values = { decimals: "no", want: "both", op: "add", from: "km", to: "m" };

/**
 * Maths tutorials: pick a method, type the numbers (or ask for an example),
 * and the chalkboard works it out step by step with read-aloud. Worked out by
 * code, so it is always right and uses no AI. Given a `topic`, it shows that
 * method alone, without its own card, heading or method chips (it sits on the
 * method's own screen).
 */
export function TutorialsCard({ topic: fixedTopic }: { topic?: string } = {}) {
  const [topicId, setTopicId] = useState(fixedTopic ?? TOPICS[0].id);
  const [values, setValues] = useState<Values>(DEFAULTS);
  const [problemError, setProblemError] = useState<string | null>(null);
  const [shown, setShown] = useState<{ example: WorkedExample; savedId: string | null; saving: boolean } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const topic = TOPICS.find((t) => t.id === topicId)!;

  const show = (v: Values) => {
    const problem = topic.problem(v);
    if (typeof problem === "string") {
      setProblemError(problem);
      return;
    }
    const example = solve(problem);
    if (!example) {
      setProblemError(tooLargeMessage(problem));
      return;
    }
    setProblemError(null);
    setShown({ example, savedId: null, saving: false });
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const giveExample = () => {
    const v = { ...values, ...topic.example() };
    setValues(v);
    show(v);
  };

  const save = async () => {
    if (!shown) return;
    setShown({ ...shown, saving: true });
    const res = await fetch("/api/worked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem: shown.example.problem }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setShown((s) => s && { ...s, saving: false, savedId: res?.ok ? (data?.id ?? null) : null });
    if (!res?.ok) setProblemError(data?.error ?? (res ? failedRequestMessage(res.status, "save this to My Documents") : OFFLINE_MESSAGE));
  };

  return (
    <section className={cx(!fixedTopic && card, "space-y-5", !fixedTopic && "p-4 sm:p-6")}>
      {!fixedTopic && (
        <div>
          <h2 className="text-base font-semibold text-slate-900">Maths tutorials</h2>
          <p className="text-sm text-slate-500">
            Choose a method, type the numbers or tap &ldquo;Give me an example&rdquo;, and watch it worked out step by step on the
            chalkboard, read aloud.
          </p>
        </div>
      )}

      <div className={cx("flex flex-wrap gap-2", fixedTopic && "hidden")} role="radiogroup" aria-label="Method">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === topicId}
            onClick={() => {
              setTopicId(t.id);
              setProblemError(null);
            }}
            className={cx(
              "min-h-10 rounded-full border px-3.5 text-sm font-medium transition-colors",
              t.id === topicId
                ? "border-brand-500 bg-brand-50 text-brand-800"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          show(values);
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {topic.fields
            .filter((f) => !f.hiddenWhen?.(values))
            .map((f) => (
              <Field key={`${topic.id}-${f.key}`} label={f.label} htmlFor={`tut-${f.key}`} hint={f.hint}>
                {f.options ? (
                  <select
                    id={`tut-${f.key}`}
                    value={values[f.key] ?? f.options[0].value}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className={cx(input, "pr-8")}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`tut-${f.key}`}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    inputMode={f.key === "numbers" ? "text" : "decimal"}
                    autoComplete="off"
                    className={input}
                  />
                )}
              </Field>
            ))}
        </div>
        {problemError && <p className="text-sm text-red-600">{problemError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={button.primary}>
            Show me the steps
          </button>
          <button type="button" onClick={giveExample} className={button.secondary}>
            <SparklesIcon className="h-4 w-4" /> Give me an example
          </button>
        </div>
      </form>

      {shown && (
        <div ref={resultRef} className="scroll-mt-20 space-y-2">
          <WorkedExampleView
            key={shown.example.title}
            example={shown.example}
            pdfUrl={shown.savedId ? `/api/documents/${shown.savedId}/pdf` : null}
            actions={
              shown.savedId ? (
                <Link href={`/dashboard/documents/${shown.savedId}`} className={cx(button.small, "text-emerald-700")}>
                  <CheckIcon className="h-4 w-4" /> Saved
                </Link>
              ) : (
                <button type="button" onClick={save} disabled={shown.saving} className={button.small}>
                  {shown.saving ? "Saving..." : "Save to Documents"}
                </button>
              )
            }
          />
          {shown.savedId && (
            <p className="text-center text-xs text-slate-500">
              Saved to{" "}
              <Link href={`/dashboard/documents/${shown.savedId}`} className={link}>
                My Documents
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </section>
  );
}
