// What the worked examples say, in English, Hindi and Marathi, using the terms
// school textbooks use (Hindi-medium NCERT; Maharashtra State Board for
// Marathi). Numbers and symbols stay as digits, as books print them; the
// read-aloud voice gets words for the symbols (see `spoken`).

export type Narration = "en" | "hi" | "mr";

export function isNarration(value: unknown): value is Narration {
  return value === "en" || value === "hi" || value === "mr";
}

const MARATHI_HINTS = /(?:^|[\s,])(?:आणि|ला|चा|ची|चे|करा|मधून|किती|म्हणजे|काढा|शोधा|भागा|यांची|मध्ये)(?=$|[\s,?।])/;

/**
 * The narration language for a question: the chosen answer language when it
 * is Hindi or Marathi; with "auto", a Devanagari question is narrated in
 * Marathi or Hindi depending on its wording. Everything else is English.
 */
export function narrationFor(setting: string | null | undefined, text: string): Narration {
  if (setting === "hi" || setting === "mr") return setting;
  if (setting && setting !== "auto") return "en";
  if (!/[ऀ-ॿ]/.test(text)) return "en";
  return MARATHI_HINTS.test(text) ? "mr" : "hi";
}

const s = (n: number, word: string) => `${word}${n === 1 ? "" : "s"}`;

const en = {
  and: "and",
  list(values: (number | string)[]): string {
    if (values.length <= 1) return String(values[0] ?? "");
    return `${values.slice(0, -1).join(", ")} ${this.and} ${values[values.length - 1]}`;
  },
  so: (sentence: string) => `So ${sentence}.`,
  correct: "Correct!",
  integerPlaces: ["ones", "tens", "hundreds", "thousands", "ten thousands", "lakhs", "ten lakhs", "crores", "ten crores", "hundred crores", "thousand crores", "ten thousand crores"],
  decimalPlaces: ["tenths", "hundredths", "thousandths", "ten-thousandths"],
  nextPlace: "next place",

  // Long division
  divisionTitle: (q: string) => `Long division: ${q}`,
  decimalDivisor: (divisor: string, factor: number, original: string, dividend: string, newDivisor: string) =>
    `The divisor ${divisor} is a decimal. Multiply both numbers by ${factor} so the divisor becomes a whole number: ${original} is the same as ${dividend} ÷ ${newDivisor}.`,
  divisionSetup: (dividend: string, divisor: string) =>
    `Let's divide ${dividend} by ${divisor}. Write ${dividend} inside the division bracket and ${divisor} outside it.`,
  addZeros: (hadPoint: boolean) =>
    `We will keep dividing after the decimal point, so we write zeros after ${hadPoint ? "the last digit" : "a decimal point"}. Adding zeros after the decimal point does not change the number.`,
  tooSmall: (work: number, divisor: number) => `${work} is smaller than ${divisor}, so ${divisor} does not go into it. Take the next digit too.`,
  pointInQuotient: "We have reached the decimal point, so put a decimal point in the quotient, right above it.",
  zeroInQuotient: (divisor: number, work: number) => `${divisor} does not go into ${work}, so write 0 in the quotient.`,
  howMany: (divisor: number, work: number, q: number, product: number, tooBig: number | null) =>
    `How many times does ${divisor} go into ${work}? ${q} ${s(q, "time")}, because ${q} × ${divisor} = ${product}${tooBig !== null ? ` and ${q + 1} × ${divisor} = ${tooBig} is too big` : ""}. Write ${q} in the quotient.`,
  multiplyDown: (q: number, divisor: number, product: number, work: number) => `Multiply: ${q} × ${divisor} = ${product}. Write ${product} under ${work}.`,
  subtractDown: (work: number, product: number, remainder: number) => `Subtract: ${work} − ${product} = ${remainder}.`,
  includeNext: (zero: boolean, next: number, value: number) => `Now include the next ${zero ? "zero" : "digit"}, ${next}: we have ${value}.`,
  bringDown: (zero: boolean, next: number, value: number) => `Bring down the next ${zero ? "zero" : "digit"}, ${next}. Now we have ${value}.`,
  exact: (original: string, quotient: string) => `The remainder is 0, so the division is exact. ${original} = ${quotient}.`,
  stopDecimals: (places: number, original: string, quotient: string) =>
    `The division keeps going, so we stop at ${places} decimal places: ${original} is about ${quotient}.`,
  approxAnswer: (original: string, quotient: string, places: number) => `${original} ≈ ${quotient} (to ${places} decimal places)`,
  remainderEnd: (quotient: string, remainder: number) => `There are no more digits to bring down. The quotient is ${quotient} and the remainder is ${remainder}.`,
  remainderAnswer: (original: string, quotient: string, remainder: number) => `${original}: quotient ${quotient}, remainder ${remainder}`,
  divisionCheck: (quotient: string, divisor: number, remainder: number, total: number) =>
    `Check: quotient × divisor + remainder = ${quotient} × ${divisor} + ${remainder} = ${total}, which is the dividend. Correct!`,

  // LCM and HCF
  HCF: "HCF",
  LCM: "LCM",
  hcfIntro: "For the HCF, write the numbers in a row and divide by prime numbers that divide every one of them.",
  lcmIntro: "For the LCM, write the numbers in a row and divide by prime numbers that divide at least one of them. A number that can't be divided is carried down as it is.",
  ladderStep(p: number, divided: number[], carried: number[]) {
    return (
      `${p} divides ${this.list(divided)}.` +
      (carried.length ? ` ${this.list(carried)} ${carried.length === 1 ? "is" : "are"} not divisible by ${p}, so carry ${carried.length === 1 ? "it" : "them"} down.` : "") +
      " Write the results in the next row."
    );
  },
  hcfStop(left: number[]) {
    return `No prime number divides all of ${this.list(left)}, so we stop here.`;
  },
  lcmStop: "Every number has become 1, so we stop.",
  hcfNone: "No prime number divides all of them, so the HCF is 1.",
  hcfValue: (primes: number[], value: number) => `Multiply the prime numbers on the left: ${primes.join(" × ")} = ${value}. So the HCF is ${value}.`,
  lcmValue: (primes: number[], value: number) => `Multiply all the prime numbers on the left: ${primes.join(" × ")} = ${value}. So the LCM is ${value}.`,
  hcfLcmCheck: (h: number, l: number, a: number, b: number) =>
    `Check: for two numbers, HCF × LCM equals their product. ${h} × ${l} = ${h * l}, and ${a} × ${b} = ${a * b}. Correct!`,
  ofNumbers(what: string, numbers: number[]) {
    return `${what} of ${this.list(numbers)}`;
  },
  hcfAndLcmOf(numbers: number[]) {
    return `HCF and LCM of ${this.list(numbers)}`;
  },

  // Column addition and subtraction
  additionTitle: (q: string) => `Column addition: ${q}`,
  subtractionTitle: (q: string) => `Column subtraction: ${q}`,
  addSetup: (decimals: boolean, padded: boolean) =>
    `Write the numbers one under another, lining up the ${decimals ? "decimal points" : "ones"}.` +
    (padded ? " Fill the empty decimal places with zeros so every number has the same number of decimal places." : ""),
  carried: (n: number) => `${n} (carried)`,
  addColumn: (place: string, parts: string, sum: number, digit: number, carry: number, next: string) =>
    `Add the ${place}: ${parts} = ${sum}.` + (carry ? ` Write ${digit} and carry ${carry} to the ${next}.` : ` Write ${digit}.`),
  pointInAnswer: "Put the decimal point in the answer, under the other decimal points.",
  finalCarry: (carry: number) => `There are no more columns, so write the carried ${carry} in front.`,
  negativeIntro: (a: string, b: string) => `${a} is smaller than ${b}, so the answer will be negative. Work out ${b} − ${a}, then put a minus sign in front.`,
  subtractSetup: (a: string, b: string, decimals: boolean, padded: boolean) =>
    `Write ${a} on top and ${b} under it, lining up the ${decimals ? "decimal points" : "ones"}.` + (padded ? " Fill the empty decimal places with zeros." : ""),
  borrow: (place: string, before: number, down: number, from: string, across: string | null, newFrom: number, newHere: number) =>
    `In the ${place}, ${before} is smaller than ${down}, so borrow from the ${from}.` +
    (across ? ` The ${across} is 0, so we borrow across it: the zeros on the way become 9.` : "") +
    ` The ${from} digit becomes ${newFrom} and the ${place} becomes ${newHere}.`,
  subtractColumn: (place: string, top: number, down: number, digit: number) => `Subtract the ${place}: ${top} − ${down} = ${digit}. Write ${digit}.`,
  subtractEnd: (question: string, result: string, magnitude: string, b: string, a: string) => `So ${question} = ${result}. Check by adding: ${magnitude} + ${b} = ${a}.`,

  // Long multiplication
  multiplicationTitle: (q: string) => `Long multiplication: ${q}`,
  multiplyIgnoringPoints: (top: string, bottom: string, decimals: number) =>
    `Multiply as if there were no decimal points: ${top} × ${bottom}. At the end we will put back ${decimals} decimal ${s(decimals, "place")}, because the two numbers have ${decimals} decimal ${s(decimals, "place")} together.`,
  multiplicationSetup: (top: string, bottom: string) => `Write ${top} on top and ${bottom} under it, lining up the ones.`,
  placeholder: (place: string, digit: number, zeros: number) =>
    `Now multiply by the ${place} digit, ${digit}. Because it is ${place}, first write ${zeros === 1 ? "a 0" : `${zeros} zeros`} on the right as a placeholder.`,
  multiplyDigit: (digit: number, t: number, carry: number, value: number, last: boolean, newCarry: number) =>
    `${digit} × ${t}${carry ? ` + ${carry} carried` : ""} = ${value}.` + (last ? ` Write ${value}.` : newCarry ? ` Write ${value % 10} and carry ${newCarry}.` : ` Write ${value}.`),
  addPartials: (partials: string[], product: string) => `Add the partial products: ${partials.join(" + ")} = ${product}.`,
  placePoint: (decimals: number, product: string, result: string) =>
    `Count ${decimals} ${s(decimals, "place")} from the right and put the decimal point: ${product} becomes ${result}.`,

  // Fractions
  simplifyTitle: (f: string) => `Simplify the fraction ${f}`,
  addFractionsTitle: (q: string) => `Adding fractions: ${q}`,
  subtractFractionsTitle: (q: string) => `Subtracting fractions: ${q}`,
  writeFraction: (f: string) => `Write the fraction ${f}.`,
  writeQuestion: (q: string) => `Write ${q}.`,
  zeroTop: "The top is 0, so the fraction is 0.",
  alreadySimplest: (n: number, d: number, f: string) => `${n} and ${d} have no common factor except 1, so ${f} is already in its simplest form.`,
  divideByHcf: (n: number, d: number, h: number) =>
    `The HCF of ${n} and ${d} is ${h}, the biggest number that divides both. Divide the top and the bottom by ${h}: ${n} ÷ ${h} = ${n / h} and ${d} ÷ ${h} = ${d / h}.`,
  wholeResult: (n: string) => `The bottom is 1, so the answer is the whole number ${n}.`,
  mixedNumber: (n: number, d: number, whole: number, rest: number, f: string, negative: boolean) =>
    `The top is bigger than the bottom, so write it as a mixed number: ${n} ÷ ${d} = ${whole} remainder ${rest}, so ${f} = ${negative ? "minus " : ""}${whole} and ${rest}/${d}.`,
  differentDenominators: (b: number, d: number, l: number) => `The denominators ${b} and ${d} are different, so make them the same. The LCM of ${b} and ${d} is ${l}.`,
  multiplyTopAndBottom: (f: string, k: number) => `multiply the top and bottom of ${f} by ${k}`,
  makeSame: (l: number, changes: string[], result: string) => `To get ${l} at the bottom, ${changes.join(", and ")}. This gives ${result}.`,
  combineNumerators: (same: boolean, add: boolean, bottom: number, sum: string) =>
    `${same ? "The denominators are the same, so " : "Now "}${add ? "add" : "subtract"} the numerators and keep the denominator ${bottom}: ${sum}.`,
  negativeBecause: (bigger: string, smaller: string) => ` The answer is negative because ${bigger} is bigger than ${smaller}.`,

  // Metric units
  convertTitle: (from: string, to: string, value: string) => `Converting ${from} to ${to}: ${value} ${from}`,
  families: { m: "length", g: "mass", l: "capacity" } as Record<string, string>,
  chart: (family: string, units: string) => `Draw the place-value chart for ${family}: ${units}. Each unit is 10 times the one on its right.`,
  writeOnChart: (value: string, ones: string, from: string, hasFraction: boolean) =>
    `Write ${value} with its ones digit, ${ones}, under ${from}${hasFraction ? ", and the digits after the decimal point in the columns to its right" : ""}.`,
  fillZeros: (to: string) => `Fill the empty places up to ${to} with zeros.`,
  readChart: (to: string, result: string, from: string, places: number, right: boolean, power: string) =>
    `Now read the number with the ones digit under ${to}: ${result} ${to}. ` +
    `${to} is ${places} ${s(places, "place")} to the ${right ? "right" : "left"} of ${from}, which is the same as ${right ? "multiplying" : "dividing"} by ${power}.`,
};

export type Phrases = typeof en;

const hi: Phrases = {
  ...en,
  and: "और",
  so: (sentence) => `अतः ${sentence}।`,
  correct: "सही है!",
  integerPlaces: ["इकाई", "दहाई", "सैकड़ा", "हज़ार", "दस हज़ार", "लाख", "दस लाख", "करोड़", "दस करोड़", "अरब", "दस अरब", "खरब"],
  decimalPlaces: ["दसवाँ", "सौवाँ", "हज़ारवाँ", "दस-हज़ारवाँ"],
  nextPlace: "अगला स्थान",

  divisionTitle: (q) => `लंबी विधि से भाग: ${q}`,
  decimalDivisor: (divisor, factor, original, dividend, newDivisor) =>
    `भाजक ${divisor} दशमलव संख्या है। दोनों संख्याओं को ${factor} से गुणा करें ताकि भाजक पूर्ण संख्या बन जाए: ${original} वही है जो ${dividend} ÷ ${newDivisor} है।`,
  divisionSetup: (dividend, divisor) => `आइए ${dividend} को ${divisor} से भाग दें। भाज्य ${dividend} को भाग के कोष्ठक के अंदर और भाजक ${divisor} को बाहर लिखें।`,
  addZeros: (hadPoint) =>
    `हम दशमलव के बाद भी भाग जारी रखेंगे, इसलिए ${hadPoint ? "अंतिम अंक" : "दशमलव बिंदु"} के बाद शून्य लिखते हैं। दशमलव के बाद शून्य लगाने से संख्या नहीं बदलती।`,
  tooSmall: (work, divisor) => `${work}, ${divisor} से छोटा है, इसलिए इसमें ${divisor} नहीं जाता। अगला अंक भी साथ लें।`,
  pointInQuotient: "हम दशमलव बिंदु तक पहुँच गए हैं, इसलिए भागफल में ठीक उसके ऊपर दशमलव बिंदु लगाएँ।",
  zeroInQuotient: (divisor, work) => `${work} में ${divisor} नहीं जाता, इसलिए भागफल में 0 लिखें।`,
  howMany: (divisor, work, q, product, tooBig) =>
    `${work} में ${divisor} कितनी बार जाता है? ${q} बार, क्योंकि ${q} × ${divisor} = ${product}${tooBig !== null ? ` और ${q + 1} × ${divisor} = ${tooBig} बहुत बड़ा है` : ""}। भागफल में ${q} लिखें।`,
  multiplyDown: (q, divisor, product, work) => `गुणा करें: ${q} × ${divisor} = ${product}। ${product} को ${work} के नीचे लिखें।`,
  subtractDown: (work, product, remainder) => `घटाएँ: ${work} − ${product} = ${remainder}।`,
  includeNext: (zero, next, value) => `अब अगला ${zero ? "शून्य" : "अंक"}, ${next}, भी साथ लें: अब ${value} है।`,
  bringDown: (zero, next, value) => `अगला ${zero ? "शून्य" : "अंक"}, ${next}, नीचे उतारें। अब ${value} है।`,
  exact: (original, quotient) => `शेषफल 0 है, इसलिए भाग पूरा हो गया। ${original} = ${quotient}।`,
  stopDecimals: (places, original, quotient) => `भाग चलता रहता है, इसलिए हम दशमलव के ${places} स्थानों पर रुकते हैं: ${original} लगभग ${quotient} है।`,
  approxAnswer: (original, quotient, places) => `${original} ≈ ${quotient} (दशमलव के ${places} स्थानों तक)`,
  remainderEnd: (quotient, remainder) => `उतारने के लिए और अंक नहीं बचे। भागफल ${quotient} और शेषफल ${remainder} है।`,
  remainderAnswer: (original, quotient, remainder) => `${original}: भागफल ${quotient}, शेषफल ${remainder}`,
  divisionCheck: (quotient, divisor, remainder, total) =>
    `जाँच: भागफल × भाजक + शेषफल = ${quotient} × ${divisor} + ${remainder} = ${total}, जो भाज्य है। सही है!`,

  HCF: "म.स.प.",
  LCM: "ल.स.प.",
  hcfIntro: "म.स.प. के लिए संख्याओं को एक पंक्ति में लिखें और उन अभाज्य संख्याओं से भाग दें जो सभी संख्याओं को विभाजित करती हैं।",
  lcmIntro: "ल.स.प. के लिए संख्याओं को एक पंक्ति में लिखें और उन अभाज्य संख्याओं से भाग दें जो कम से कम एक संख्या को विभाजित करती हैं। जो संख्या विभाजित न हो, उसे वैसे ही नीचे लिख दें।",
  ladderStep(p, divided, carried) {
    return (
      `${p} से ${this.list(divided)} विभाजित ${divided.length === 1 ? "होता है" : "होते हैं"}।` +
      (carried.length ? ` ${this.list(carried)} ${p} से विभाजित नहीं ${carried.length === 1 ? "होता" : "होते"}, इसलिए ${carried.length === 1 ? "उसे" : "उन्हें"} वैसे ही नीचे लिखें।` : "") +
      " परिणाम अगली पंक्ति में लिखें।"
    );
  },
  hcfStop(left) {
    return `कोई भी अभाज्य संख्या ${this.list(left)} सभी को विभाजित नहीं करती, इसलिए हम यहीं रुकते हैं।`;
  },
  lcmStop: "हर संख्या 1 हो गई है, इसलिए हम रुकते हैं।",
  hcfNone: "कोई भी अभाज्य संख्या सभी को विभाजित नहीं करती, इसलिए म.स.प. 1 है।",
  hcfValue: (primes, value) => `बाईं ओर की अभाज्य संख्याओं का गुणा करें: ${primes.join(" × ")} = ${value}। अतः म.स.प. ${value} है।`,
  lcmValue: (primes, value) => `बाईं ओर की सभी अभाज्य संख्याओं का गुणा करें: ${primes.join(" × ")} = ${value}। अतः ल.स.प. ${value} है।`,
  hcfLcmCheck: (h, l, a, b) => `जाँच: दो संख्याओं के लिए म.स.प. × ल.स.प. उनके गुणनफल के बराबर होता है। ${h} × ${l} = ${h * l}, और ${a} × ${b} = ${a * b}। सही है!`,
  ofNumbers(what, numbers) {
    return `${this.list(numbers)} का ${what}`;
  },
  hcfAndLcmOf(numbers) {
    return `${this.list(numbers)} का म.स.प. और ल.स.प.`;
  },

  additionTitle: (q) => `स्तंभ में जोड़: ${q}`,
  subtractionTitle: (q) => `स्तंभ में घटाव: ${q}`,
  addSetup: (decimals, padded) =>
    `संख्याओं को एक के नीचे एक लिखें, ${decimals ? "दशमलव बिंदुओं" : "इकाई के अंकों"} को सीध में रखते हुए।` +
    (padded ? " खाली दशमलव स्थानों में शून्य भरें ताकि सभी संख्याओं में दशमलव के बाद बराबर अंक हों।" : ""),
  carried: (n) => `${n} (हासिल)`,
  addColumn: (place, parts, sum, digit, carry, next) =>
    `${place} के अंक जोड़ें: ${parts} = ${sum}।` + (carry ? ` ${digit} लिखें और ${carry} हासिल ${next} में ले जाएँ।` : ` ${digit} लिखें।`),
  pointInAnswer: "उत्तर में दशमलव बिंदु बाकी दशमलव बिंदुओं के ठीक नीचे लगाएँ।",
  finalCarry: (carry) => `अब कोई स्तंभ नहीं बचा, इसलिए हासिल ${carry} को आगे लिखें।`,
  negativeIntro: (a, b) => `${a}, ${b} से छोटा है, इसलिए उत्तर ऋणात्मक होगा। ${b} − ${a} निकालें, फिर आगे ऋण चिह्न लगाएँ।`,
  subtractSetup: (a, b, decimals, padded) =>
    `${a} को ऊपर और ${b} को उसके नीचे लिखें, ${decimals ? "दशमलव बिंदुओं" : "इकाई के अंकों"} को सीध में रखते हुए।` + (padded ? " खाली दशमलव स्थानों में शून्य भरें।" : ""),
  borrow: (place, before, down, from, across, newFrom, newHere) =>
    `${place} में ${before}, ${down} से छोटा है, इसलिए ${from} से उधार लें।` +
    (across ? ` ${across} का अंक 0 है, इसलिए उसके पार से उधार लेते हैं: रास्ते के शून्य 9 बन जाते हैं।` : "") +
    ` ${from} का अंक ${newFrom} और ${place} का अंक ${newHere} हो जाता है।`,
  subtractColumn: (place, top, down, digit) => `${place} के अंक घटाएँ: ${top} − ${down} = ${digit}। ${digit} लिखें।`,
  subtractEnd: (question, result, magnitude, b, a) => `अतः ${question} = ${result}। जोड़कर जाँचें: ${magnitude} + ${b} = ${a}।`,

  multiplicationTitle: (q) => `लंबी विधि से गुणा: ${q}`,
  multiplyIgnoringPoints: (top, bottom, decimals) =>
    `दशमलव बिंदुओं को छोड़कर गुणा करें: ${top} × ${bottom}। अंत में दशमलव के ${decimals} स्थान वापस लगाएँगे, क्योंकि दोनों संख्याओं में कुल मिलाकर दशमलव के ${decimals} स्थान हैं।`,
  multiplicationSetup: (top, bottom) => `${top} को ऊपर और ${bottom} को उसके नीचे लिखें, इकाई के अंकों को सीध में रखते हुए।`,
  placeholder: (place, digit, zeros) => `अब ${place} के अंक ${digit} से गुणा करें। यह ${place} का अंक है, इसलिए पहले दाईं ओर ${zeros === 1 ? "एक 0" : `${zeros} शून्य`} लिखें।`,
  multiplyDigit: (digit, t, carry, value, last, newCarry) =>
    `${digit} × ${t}${carry ? ` + ${carry} हासिल` : ""} = ${value}।` + (last ? ` ${value} लिखें।` : newCarry ? ` ${value % 10} लिखें और ${newCarry} हासिल लें।` : ` ${value} लिखें।`),
  addPartials: (partials, product) => `आंशिक गुणनफलों को जोड़ें: ${partials.join(" + ")} = ${product}।`,
  placePoint: (decimals, product, result) => `दाईं ओर से ${decimals} स्थान गिनकर दशमलव बिंदु लगाएँ: ${product} बन जाता है ${result}।`,

  simplifyTitle: (f) => `भिन्न ${f} को सरलतम रूप में लिखना`,
  addFractionsTitle: (q) => `भिन्नों का जोड़: ${q}`,
  subtractFractionsTitle: (q) => `भिन्नों का घटाव: ${q}`,
  writeFraction: (f) => `भिन्न ${f} लिखें।`,
  writeQuestion: (q) => `${q} लिखें।`,
  zeroTop: "अंश 0 है, इसलिए भिन्न 0 है।",
  alreadySimplest: (n, d, f) => `${n} और ${d} का 1 के अलावा कोई सार्व गुणनखंड नहीं है, इसलिए ${f} पहले से ही सरलतम रूप में है।`,
  divideByHcf: (n, d, h) =>
    `${n} और ${d} का म.स.प. ${h} है, यानी वह सबसे बड़ी संख्या जो दोनों को विभाजित करती है। अंश और हर दोनों को ${h} से भाग दें: ${n} ÷ ${h} = ${n / h} और ${d} ÷ ${h} = ${d / h}।`,
  wholeResult: (n) => `हर 1 है, इसलिए उत्तर पूर्ण संख्या ${n} है।`,
  mixedNumber: (n, d, whole, rest, f, negative) =>
    `अंश हर से बड़ा है, इसलिए इसे मिश्र भिन्न में लिखें: ${n} ÷ ${d} = ${whole}, शेष ${rest}, अतः ${f} = ${negative ? "ऋण " : ""}${whole} पूर्णांक ${rest}/${d}।`,
  differentDenominators: (b, d, l) => `हर ${b} और ${d} अलग-अलग हैं, इसलिए उन्हें बराबर बनाएँ। ${b} और ${d} का ल.स.प. ${l} है।`,
  multiplyTopAndBottom: (f, k) => `${f} के अंश और हर को ${k} से गुणा करें`,
  makeSame: (l, changes, result) => `हर में ${l} लाने के लिए ${changes.join(", और ")}। इससे मिलता है ${result}।`,
  combineNumerators: (same, add, bottom, sum) =>
    `${same ? "हर बराबर हैं, इसलिए " : "अब "}अंशों को ${add ? "जोड़ें" : "घटाएँ"} और हर ${bottom} वही रखें: ${sum}।`,
  negativeBecause: (bigger, smaller) => ` उत्तर ऋणात्मक है क्योंकि ${bigger}, ${smaller} से बड़ा है।`,

  convertTitle: (from, to, value) => `${from} को ${to} में बदलना: ${value} ${from}`,
  families: { m: "लंबाई", g: "द्रव्यमान", l: "धारिता" },
  chart: (family, units) => `${family} के लिए स्थानीय मान सारणी बनाएँ: ${units}। हर इकाई अपनी दाईं ओर वाली इकाई की 10 गुना होती है।`,
  writeOnChart: (value, ones, from, hasFraction) =>
    `${value} को इस तरह लिखें कि इसका इकाई का अंक ${ones}, ${from} के नीचे आए${hasFraction ? ", और दशमलव के बाद के अंक उसके दाईं ओर के स्तंभों में" : ""}।`,
  fillZeros: (to) => `${to} तक के खाली स्थानों में शून्य भरें।`,
  readChart: (to, result, from, places, right, power) =>
    `अब इकाई का अंक ${to} के नीचे मानकर संख्या पढ़ें: ${result} ${to}। ` +
    `${to}, ${from} से ${places} स्थान ${right ? "दाईं" : "बाईं"} ओर है, यह ${power} से ${right ? "गुणा" : "भाग"} करने के बराबर है।`,
};

const mr: Phrases = {
  ...en,
  and: "आणि",
  so: (sentence) => `म्हणून ${sentence}.`,
  correct: "बरोबर!",
  integerPlaces: ["एकक", "दशक", "शतक", "हजार", "दशहजार", "लाख", "दशलक्ष", "कोटी", "दशकोटी", "अब्ज", "दशअब्ज", "खर्व"],
  decimalPlaces: ["दशांश", "शतांश", "सहस्रांश", "दशसहस्रांश"],
  nextPlace: "पुढील स्थान",

  divisionTitle: (q) => `भागाकार: ${q}`,
  decimalDivisor: (divisor, factor, original, dividend, newDivisor) =>
    `भाजक ${divisor} ही दशांश संख्या आहे. दोन्ही संख्यांना ${factor} ने गुणा म्हणजे भाजक पूर्ण संख्या होईल: ${original} हे ${dividend} ÷ ${newDivisor} सारखेच आहे.`,
  divisionSetup: (dividend, divisor) => `चला ${dividend} ला ${divisor} ने भागू. भाज्य ${dividend} भागाकाराच्या कंसात आणि भाजक ${divisor} बाहेर लिहा.`,
  addZeros: (hadPoint) =>
    `आपण दशांश चिन्हानंतरही भागाकार चालू ठेवणार आहोत, म्हणून ${hadPoint ? "शेवटच्या अंकानंतर" : "दशांश चिन्हानंतर"} शून्ये लिहू. दशांश चिन्हानंतर शून्ये लिहिल्याने संख्या बदलत नाही.`,
  tooSmall: (work, divisor) => `${work} हा ${divisor} पेक्षा लहान आहे, म्हणून ${divisor} ने भाग जात नाही. पुढचा अंकही घ्या.`,
  pointInQuotient: "आपण दशांश चिन्हापर्यंत पोहोचलो, म्हणून भागाकारात त्याच्या अगदी वर दशांश चिन्ह द्या.",
  zeroInQuotient: (divisor, work) => `${work} ला ${divisor} ने भाग जात नाही, म्हणून भागाकारात 0 लिहा.`,
  howMany: (divisor, work, q, product, tooBig) =>
    `${work} मध्ये ${divisor} किती वेळा जातो? ${q} वेळा, कारण ${q} × ${divisor} = ${product}${tooBig !== null ? ` आणि ${q + 1} × ${divisor} = ${tooBig} हे जास्त होते` : ""}. भागाकारात ${q} लिहा.`,
  multiplyDown: (q, divisor, product, work) => `गुणाकार करा: ${q} × ${divisor} = ${product}. ${product} हे ${work} च्या खाली लिहा.`,
  subtractDown: (work, product, remainder) => `वजाबाकी करा: ${work} − ${product} = ${remainder}.`,
  includeNext: (zero, next, value) => `आता पुढचा ${zero ? "शून्य" : "अंक"}, ${next}, सोबत घ्या: आता ${value} झाले.`,
  bringDown: (zero, next, value) => `पुढचा ${zero ? "शून्य" : "अंक"}, ${next}, खाली उतरवा. आता ${value} झाले.`,
  exact: (original, quotient) => `बाकी 0 आहे, म्हणून भाग पूर्ण जातो. ${original} = ${quotient}.`,
  stopDecimals: (places, original, quotient) => `भागाकार संपत नाही, म्हणून आपण दशांश चिन्हानंतर ${places} स्थानांवर थांबतो: ${original} हे सुमारे ${quotient} आहे.`,
  approxAnswer: (original, quotient, places) => `${original} ≈ ${quotient} (दशांश चिन्हानंतर ${places} स्थानांपर्यंत)`,
  remainderEnd: (quotient, remainder) => `खाली उतरवायला आणखी अंक नाहीत. भागाकार ${quotient} आणि बाकी ${remainder} आहे.`,
  remainderAnswer: (original, quotient, remainder) => `${original}: भागाकार ${quotient}, बाकी ${remainder}`,
  divisionCheck: (quotient, divisor, remainder, total) =>
    `पडताळा: भागाकार × भाजक + बाकी = ${quotient} × ${divisor} + ${remainder} = ${total}, म्हणजेच भाज्य. बरोबर!`,

  HCF: "म.सा.वि.",
  LCM: "ल.सा.वि.",
  hcfIntro: "म.सा.वि. साठी संख्या एका ओळीत लिहा आणि सर्व संख्यांना भाग जाणाऱ्या मूळ संख्यांनी भागा.",
  lcmIntro: "ल.सा.वि. साठी संख्या एका ओळीत लिहा आणि किमान एका संख्येला भाग जाणाऱ्या मूळ संख्यांनी भागा. ज्या संख्येला भाग जात नाही ती तशीच खाली लिहा.",
  ladderStep(p, divided, carried) {
    return (
      `${this.list(divided)} ला ${p} ने भाग जातो.` +
      (carried.length ? ` ${this.list(carried)} ला ${p} ने भाग जात नाही, म्हणून ${carried.length === 1 ? "ती तशीच" : "त्या तशाच"} खाली लिहा.` : "") +
      " उत्तरे पुढच्या ओळीत लिहा."
    );
  },
  hcfStop(left) {
    return `${this.list(left)} या सर्वांना भाग जाणारी मूळ संख्या नाही, म्हणून आपण इथे थांबतो.`;
  },
  lcmStop: "प्रत्येक संख्या 1 झाली आहे, म्हणून आपण थांबतो.",
  hcfNone: "सर्वांना भाग जाणारी मूळ संख्या नाही, म्हणून म.सा.वि. 1 आहे.",
  hcfValue: (primes, value) => `डावीकडील मूळ संख्यांचा गुणाकार करा: ${primes.join(" × ")} = ${value}. म्हणून म.सा.वि. ${value} आहे.`,
  lcmValue: (primes, value) => `डावीकडील सर्व मूळ संख्यांचा गुणाकार करा: ${primes.join(" × ")} = ${value}. म्हणून ल.सा.वि. ${value} आहे.`,
  hcfLcmCheck: (h, l, a, b) => `पडताळा: दोन संख्यांसाठी म.सा.वि. × ल.सा.वि. = त्यांचा गुणाकार. ${h} × ${l} = ${h * l}, आणि ${a} × ${b} = ${a * b}. बरोबर!`,
  ofNumbers(what, numbers) {
    return `${this.list(numbers)} यांचा ${what}`;
  },
  hcfAndLcmOf(numbers) {
    return `${this.list(numbers)} यांचा म.सा.वि. आणि ल.सा.वि.`;
  },

  additionTitle: (q) => `उभी बेरीज: ${q}`,
  subtractionTitle: (q) => `उभी वजाबाकी: ${q}`,
  addSetup: (decimals, padded) =>
    `संख्या एकाखाली एक लिहा, ${decimals ? "दशांश चिन्हे" : "एककाचे अंक"} एका रेषेत ठेवून.` +
    (padded ? " रिकाम्या दशांश स्थानांत शून्ये लिहा म्हणजे सर्व संख्यांत दशांश चिन्हानंतर तितकेच अंक असतील." : ""),
  carried: (n) => `${n} (हातचा)`,
  addColumn: (place, parts, sum, digit, carry, next) =>
    `${place} स्थानाचे अंक मिळवा: ${parts} = ${sum}.` + (carry ? ` ${digit} लिहा आणि ${carry} हातचा ${next} स्थानात न्या.` : ` ${digit} लिहा.`),
  pointInAnswer: "उत्तरात दशांश चिन्ह इतर दशांश चिन्हांच्या अगदी खाली द्या.",
  finalCarry: (carry) => `आता आणखी स्तंभ नाहीत, म्हणून हातचा ${carry} पुढे लिहा.`,
  negativeIntro: (a, b) => `${a} हा ${b} पेक्षा लहान आहे, म्हणून उत्तर ऋण येईल. ${b} − ${a} काढा, मग पुढे ऋण चिन्ह लिहा.`,
  subtractSetup: (a, b, decimals, padded) =>
    `${a} वर आणि ${b} त्याच्या खाली लिहा, ${decimals ? "दशांश चिन्हे" : "एककाचे अंक"} एका रेषेत ठेवून.` + (padded ? " रिकाम्या दशांश स्थानांत शून्ये लिहा." : ""),
  borrow: (place, before, down, from, across, newFrom, newHere) =>
    `${place} स्थानी ${before} हा ${down} पेक्षा लहान आहे, म्हणून ${from} स्थानाकडून हातचा घ्या.` +
    (across ? ` ${across} स्थानी 0 आहे, म्हणून त्याच्या पलीकडून हातचा घेतो: मधली शून्ये 9 होतात.` : "") +
    ` ${from} स्थानाचा अंक ${newFrom} आणि ${place} स्थानाचा अंक ${newHere} होतो.`,
  subtractColumn: (place, top, down, digit) => `${place} स्थानाची वजाबाकी करा: ${top} − ${down} = ${digit}. ${digit} लिहा.`,
  subtractEnd: (question, result, magnitude, b, a) => `म्हणून ${question} = ${result}. बेरीज करून पडताळा: ${magnitude} + ${b} = ${a}.`,

  multiplicationTitle: (q) => `गुणाकार: ${q}`,
  multiplyIgnoringPoints: (top, bottom, decimals) =>
    `दशांश चिन्हे नाहीत असे समजून गुणाकार करा: ${top} × ${bottom}. शेवटी दशांश चिन्ह ${decimals} स्थानांवर परत देऊ, कारण दोन्ही संख्यांत मिळून दशांश चिन्हानंतर ${decimals} अंक आहेत.`,
  multiplicationSetup: (top, bottom) => `${top} वर आणि ${bottom} त्याच्या खाली लिहा, एककाचे अंक एका रेषेत ठेवून.`,
  placeholder: (place, digit, zeros) => `आता ${place} स्थानाच्या अंकाने, ${digit} ने, गुणा. हा ${place} स्थानाचा अंक आहे, म्हणून आधी उजवीकडे ${zeros === 1 ? "एक 0" : `${zeros} शून्ये`} लिहा.`,
  multiplyDigit: (digit, t, carry, value, last, newCarry) =>
    `${digit} × ${t}${carry ? ` + ${carry} हातचा` : ""} = ${value}.` + (last ? ` ${value} लिहा.` : newCarry ? ` ${value % 10} लिहा आणि ${newCarry} हातचा घ्या.` : ` ${value} लिहा.`),
  addPartials: (partials, product) => `मधल्या गुणाकारांची बेरीज करा: ${partials.join(" + ")} = ${product}.`,
  placePoint: (decimals, product, result) => `उजवीकडून ${decimals} स्थाने मोजून दशांश चिन्ह द्या: ${product} चे ${result} होते.`,

  simplifyTitle: (f) => `अपूर्णांक ${f} संक्षिप्त रूपात`,
  addFractionsTitle: (q) => `अपूर्णांकांची बेरीज: ${q}`,
  subtractFractionsTitle: (q) => `अपूर्णांकांची वजाबाकी: ${q}`,
  writeFraction: (f) => `अपूर्णांक ${f} लिहा.`,
  writeQuestion: (q) => `${q} लिहा.`,
  zeroTop: "अंश 0 आहे, म्हणून अपूर्णांक 0 आहे.",
  alreadySimplest: (n, d, f) => `${n} आणि ${d} यांना 1 शिवाय दुसरा सामाईक विभाजक नाही, म्हणून ${f} आधीच संक्षिप्त रूपात आहे.`,
  divideByHcf: (n, d, h) =>
    `${n} आणि ${d} यांचा म.सा.वि. ${h} आहे, म्हणजे दोघांना भाग जाणारी सर्वात मोठी संख्या. अंश आणि छेद दोघांना ${h} ने भागा: ${n} ÷ ${h} = ${n / h} आणि ${d} ÷ ${h} = ${d / h}.`,
  wholeResult: (n) => `छेद 1 आहे, म्हणून उत्तर पूर्ण संख्या ${n} आहे.`,
  mixedNumber: (n, d, whole, rest, f, negative) =>
    `अंश छेदापेक्षा मोठा आहे, म्हणून तो पूर्णांकयुक्त अपूर्णांक रूपात लिहा: ${n} ÷ ${d} = ${whole}, बाकी ${rest}, म्हणून ${f} = ${negative ? "ऋण " : ""}${whole} पूर्णांक ${rest}/${d}.`,
  differentDenominators: (b, d, l) => `छेद ${b} आणि ${d} वेगवेगळे आहेत, म्हणून ते समान करू. ${b} आणि ${d} यांचा ल.सा.वि. ${l} आहे.`,
  multiplyTopAndBottom: (f, k) => `${f} च्या अंश आणि छेदाला ${k} ने गुणा`,
  makeSame: (l, changes, result) => `छेद ${l} करण्यासाठी ${changes.join(", आणि ")}. त्यामुळे ${result} मिळते.`,
  combineNumerators: (same, add, bottom, sum) =>
    `${same ? "छेद समान आहेत, म्हणून " : "आता "}अंशांची ${add ? "बेरीज" : "वजाबाकी"} करा आणि छेद ${bottom} तसाच ठेवा: ${sum}.`,
  negativeBecause: (bigger, smaller) => ` उत्तर ऋण आहे कारण ${bigger} हा ${smaller} पेक्षा मोठा आहे.`,

  convertTitle: (from, to, value) => `${from} चे ${to} मध्ये रूपांतर: ${value} ${from}`,
  families: { m: "लांबी", g: "वस्तुमान", l: "धारकता" },
  chart: (family, units) => `${family} साठी स्थानिक किंमत तक्ता काढा: ${units}. प्रत्येक एकक त्याच्या उजवीकडील एककाच्या 10 पट असते.`,
  writeOnChart: (value, ones, from, hasFraction) =>
    `${value} असे लिहा की त्याचा एककाचा अंक ${ones} ${from} च्या खाली येईल${hasFraction ? ", आणि दशांश चिन्हानंतरचे अंक त्याच्या उजवीकडील स्तंभांत" : ""}.`,
  fillZeros: (to) => `${to} पर्यंतच्या रिकाम्या जागांत शून्ये लिहा.`,
  readChart: (to, result, from, places, right, power) =>
    `आता एककाचा अंक ${to} च्या खाली आहे असे समजून संख्या वाचा: ${result} ${to}. ` +
    `${to} हे ${from} च्या ${places} स्थाने ${right ? "उजवीकडे" : "डावीकडे"} आहे, म्हणजेच ${power} ने ${right ? "गुणणे" : "भागणे"}.`,
};

const PHRASES: Record<Narration, Phrases> = { en, hi, mr };

/** The language field saved with a problem: only when it isn't English. */
export function savedLanguage(language: Narration | undefined): { language?: "hi" | "mr" } {
  return language === "hi" || language === "mr" ? { language } : {};
}

export function phrases(language: Narration | undefined): Phrases {
  return PHRASES[language ?? "en"];
}

const SYMBOL_WORDS: Record<Narration, [RegExp, string][]> = {
  en: [[/×/g, " times "], [/÷/g, " divided by "], [/−/g, " minus "], [/≈/g, " is about "]],
  hi: [[/×/g, " गुणा "], [/÷/g, " भाग "], [/−/g, " घटा "], [/\+/g, " जोड़ "], [/=/g, " बराबर "], [/≈/g, " लगभग "]],
  mr: [[/×/g, " गुणिले "], [/÷/g, " भागिले "], [/−/g, " वजा "], [/\+/g, " अधिक "], [/=/g, " बरोबर "], [/≈/g, " सुमारे "]],
};

const UNIT_PREFIX: Record<string, string> = { k: "किलो", h: "हेक्टो", da: "डेका", "": "", d: "डेसी", c: "सेंटी", m: "मिली" };
const UNIT_BASE: Record<"hi" | "mr", Record<string, string>> = {
  hi: { m: "मीटर", g: "ग्राम", l: "लीटर" },
  mr: { m: "मीटर", g: "ग्रॅम", l: "लिटर" },
};

/** The narration as the read-aloud voice should say it: symbols, fractions and unit symbols in words. */
export function spoken(text: string, language: string): string {
  const lang: Narration = isNarration(language) ? language : "en";
  let out = text;
  // A Hindi or Marathi voice spells out "km"; say "किलोमीटर".
  if (lang !== "en") {
    out = out.replace(/(?<![A-Za-z])(k|h|da|d|c|m)?(m|g|l)(?![A-Za-z])/g, (_, prefix = "", base) => UNIT_PREFIX[prefix] + UNIT_BASE[lang][base]);
  }
  out = out.replace(/(\d+)\/(\d+)/g, (_, a, b) => (lang === "hi" ? `${a} बटा ${b}` : lang === "mr" ? `${b} पैकी ${a}` : `${a} over ${b}`));
  for (const [symbol, word] of SYMBOL_WORDS[lang]) out = out.replace(symbol, word);
  return out.replace(/\s{2,}/g, " ");
}
