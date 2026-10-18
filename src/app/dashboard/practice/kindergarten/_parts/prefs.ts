import { ROUND_SIZES, type CompareSettings, type CvcSettings, type SightSettings } from "@/lib/kindergarten/quiz";
import { SIGHT_LEVELS, VOWELS } from "@/lib/kindergarten/words";

// Saved choices are read back from the browser, so each is checked before it is trusted.
export const isCvc = (v: unknown): v is CvcSettings => {
  const s = v as CvcSettings;
  return (
    Boolean(s) &&
    Array.isArray(s.vowels) &&
    s.vowels.every((x) => (VOWELS as readonly string[]).includes(x)) &&
    ROUND_SIZES.includes(s.questions as 5 | 10)
  );
};
export const isSight = (v: unknown): v is SightSettings => {
  const s = v as SightSettings;
  return Boolean(s) && (SIGHT_LEVELS as string[]).includes(s.level) && ROUND_SIZES.includes(s.questions as 5 | 10);
};
export const isCompare = (v: unknown): v is CompareSettings => {
  const s = v as CompareSettings;
  return Boolean(s) && [5, 10, 20].includes(s.max) && ROUND_SIZES.includes(s.questions as 5 | 10);
};
