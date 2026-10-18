"use client";

import { Field, cx, input } from "@/components/ui";
import { groupDigits } from "@/lib/practice/numbers";
import type { OrderSettings } from "@/lib/practice/order";

const select = cx(input, "pr-8");
const PLACE_RANGES = [
  [1, 1],
  [2, 2],
  [1, 2],
  [1, 3],
  [2, 3],
  [1, 4],
];

type Props = { settings: OrderSettings; update: (changes: Partial<OrderSettings>) => void };

function WholeFields({ settings, update }: Props) {
  return (
    <Field label="Size of numbers" htmlFor="digits">
      <select id="digits" className={select} value={settings.digits} onChange={(e) => update({ digits: Number(e.target.value) })}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <option key={d} value={d}>
            {d} digit{d === 1 ? "" : "s"} ({groupDigits(String(d === 1 ? 1 : 10 ** (d - 1)))} to {groupDigits(String(10 ** d - 1))})
          </option>
        ))}
      </select>
    </Field>
  );
}

function DecimalFields({ settings, update }: Props) {
  // A sample like 3.1415 can set a range that isn't in the list.
  const listed = PLACE_RANGES.some(([a, b]) => a === settings.minPlaces && b === settings.maxPlaces);
  return (
    <>
      <Field label="Before the point" htmlFor="intDigits">
        <select id="intDigits" className={select} value={settings.digits} onChange={(e) => update({ digits: Number(e.target.value) })}>
          <option value={0}>Just 0 (like 0.25)</option>
          <option value={1}>1 digit (like 3.25)</option>
          <option value={2}>2 digits (like 43.25)</option>
          <option value={3}>3 digits (like 543.25)</option>
        </select>
      </Field>
      <Field label="After the point" htmlFor="places" hint="Mixed lengths (like 3.7 and 3.142) catch the most common mistake.">
        <select
          id="places"
          className={select}
          value={`${settings.minPlaces}-${settings.maxPlaces}`}
          onChange={(e) => {
            const [minPlaces, maxPlaces] = e.target.value.split("-").map(Number);
            update({ minPlaces, maxPlaces });
          }}
        >
          {PLACE_RANGES.map(([a, b]) => (
            <option key={`${a}-${b}`} value={`${a}-${b}`}>
              {a === b ? `${a} digit${a === 1 ? "" : "s"}` : `${a} to ${b} digits (mixed)`}
            </option>
          ))}
          {!listed && (
            <option value={`${settings.minPlaces}-${settings.maxPlaces}`}>
              {settings.minPlaces} to {settings.maxPlaces} digits (mixed)
            </option>
          )}
        </select>
      </Field>
    </>
  );
}

function FractionFields({ settings, update }: Props) {
  return (
    <>
      <Field label="Bottom numbers up to" htmlFor="maxDen">
        <select
          id="maxDen"
          className={select}
          value={settings.maxDenominator}
          onChange={(e) => update({ maxDenominator: Number(e.target.value) })}
        >
          {Array.from({ length: 17 }, (_, i) => i + 4).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="space-y-2 self-end">
        <legend className="sr-only">Fractions bigger than 1</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings.improper}
            onChange={(e) => update({ improper: e.target.checked })}
            className="h-4 w-4 accent-brand-600"
          />
          Include fractions bigger than 1
        </label>
        {settings.improper && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.mixed}
              onChange={(e) => update({ mixed: e.target.checked })}
              className="h-4 w-4 accent-brand-600"
            />
            Write them as mixed numbers (1 3/4)
          </label>
        )}
      </fieldset>
    </>
  );
}

function SpreadField({ settings, update }: Props) {
  return (
    <Field
      label="Keep numbers close (optional)"
      htmlFor="spread"
      hint={
        settings.kind === "whole"
          ? "The biggest gap between the smallest and biggest number."
          : "How far apart the whole number parts may be. 0 keeps them all the same."
      }
    >
      <input
        id="spread"
        type="number"
        min={0}
        inputMode="numeric"
        placeholder="Any"
        value={settings.spread ?? ""}
        onChange={(e) => update({ spread: e.target.value === "" ? null : Number(e.target.value) })}
        className={input}
      />
    </Field>
  );
}

/** The choices that make the quiz easier or harder: they depend on the kind of numbers. */
export function SettingsFields({ settings, update }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {settings.kind === "whole" && <WholeFields settings={settings} update={update} />}
      {settings.kind === "decimal" && <DecimalFields settings={settings} update={update} />}
      {settings.kind === "fraction" && <FractionFields settings={settings} update={update} />}
      {settings.kind !== "fraction" && <SpreadField settings={settings} update={update} />}
      <Field label="Questions" htmlFor="questions">
        <select
          id="questions"
          className={select}
          value={settings.questions}
          onChange={(e) => update({ questions: Number(e.target.value) })}
        >
          {[5, 10, 15, 20].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
