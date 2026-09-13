/**
 * Hands-free review: what a spoken answer counts as, and what a spoken word asks for.
 *
 * Speech recognition hears "it's water" for "Water" and "six" for "6", so an
 * answer is judged on its meaning-carrying words — stemmed, numbers read as
 * numbers, a letter or two of mishearing forgiven — rather than letter for
 * letter. A few short phrases are commands instead of answers.
 */

export type Verdict = "right" | "close" | "wrong";
export type VoiceCommand = "repeat" | "skip" | "stop" | "dont-know" | null;

const WORD = /[\p{L}\p{N}]+/gu;
const FILLER = new Set(
  "a an the is are was were be of to in on it its it's um uh er erm like i think maybe so well".split(
    " ",
  ),
);
const NUMBERS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  hundred: "100",
  thousand: "1000",
};

function stem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("es") && /(ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** The words of a phrase that carry what it means. */
export function answerWords(text: string): string[] {
  const words = (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(WORD) ?? []
  )
    .filter((word) => !FILLER.has(word))
    .map((word) => NUMBERS[word] ?? stem(word));
  return [...new Set(words)];
}

/** One letter wrong, added or missing, in a word long enough for that to be mishearing. */
function nearly(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function judgeAnswer(expected: string, heard: string): Verdict {
  const wanted = answerWords(expected);
  const got = answerWords(heard);
  if (got.length === 0) return "wrong";
  if (wanted.length === 0) return "right";
  const matched = wanted.filter((word) => got.some((each) => nearly(each, word))).length;
  const share = matched / wanted.length;
  if (share >= 0.8) return "right";
  return share >= 0.5 ? "close" : "wrong";
}

export function commandOf(heard: string): VoiceCommand {
  const phrase = heard
    .toLowerCase()
    .replace(/[.!?,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(repeat|repeat that|say (it|that) again|again|pardon|what)$/.test(phrase)) return "repeat";
  if (/^(skip|skip it|next|pass)$/.test(phrase)) return "skip";
  if (/^(stop|quit|end|finish|i'm done|that's enough)$/.test(phrase)) return "stop";
  if (
    /^(i don't know|i do not know|dont know|don't know|no idea|show (me )?(the )?answer|tell me)$/.test(
      phrase,
    )
  ) {
    return "dont-know";
  }
  return null;
}

/** Markdown as it should be read aloud: no stars, backticks or escapes. */
export function speakable(text: string): string {
  return text
    .replace(/\\(.)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|==|`)/g, "")
    .replace(/^\s*(#{1,6}|>)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
