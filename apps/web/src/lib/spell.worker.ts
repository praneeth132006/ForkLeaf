import nspell from "nspell";
import { rankSuggestions } from "./spell-rank";
import { VOCABULARY } from "./spell-vocabulary";

/**
 * The dictionary, off the main thread.
 *
 * Building a Hunspell checker from fifty thousand words and their affix rules
 * takes long enough on a phone to stall typing, and finding suggestions for a
 * word is a search. Both happen here, and the page only ever waits on a
 * message.
 *
 * Messages in:  { id, type: "check", words } · { id, type: "suggest", word } ·
 *               { type: "add", words }
 * Messages out: { id, type: "checked", results: [word, ok][] } ·
 *               { id, type: "suggested", suggestions } · { type: "failed", message }
 */

type Request =
  | { id: number; type: "check"; words: string[] }
  | { id: number; type: "suggest"; word: string }
  | { type: "add"; words: string[] };

/**
 * The worker's own global, typed by hand: pulling in TypeScript's `webworker`
 * library would clash with the DOM library the rest of the app is checked
 * against.
 */
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown) => void;
};

let checker: ReturnType<typeof nspell> | null = null;
let loading: Promise<ReturnType<typeof nspell>> | null = null;
const personal: string[] = [];

async function load(): Promise<ReturnType<typeof nspell>> {
  const [aff, dic] = await Promise.all([
    fetch("/dictionaries/en.aff").then((response) => {
      if (!response.ok)
        throw new Error(`The dictionary rules could not be loaded (${response.status}).`);
      return response.text();
    }),
    fetch("/dictionaries/en.dic").then((response) => {
      if (!response.ok) throw new Error(`The dictionary could not be loaded (${response.status}).`);
      return response.text();
    }),
  ]);
  const built = nspell(aff, dic);
  for (const word of VOCABULARY) built.add(word);
  for (const word of personal) built.add(word);
  checker = built;
  return built;
}

function ready(): Promise<ReturnType<typeof nspell>> {
  if (checker) return Promise.resolve(checker);
  loading ??= load().catch((error: unknown) => {
    // Let a later message try again rather than failing for good.
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * Whether a word is spelt right, more forgiving than the dictionary alone.
 *
 * Curly apostrophes are straightened (the dictionary has "don't", writers type
 * "don’t"), and a capitalised word is also accepted in lower case, since any
 * word can start a sentence.
 */
function correct(spell: ReturnType<typeof nspell>, word: string): boolean {
  const plain = word.replace(/’/g, "'");
  if (spell.correct(plain)) return true;
  const lower = plain.toLowerCase();
  return lower !== plain && spell.correct(lower);
}

scope.onmessage = async (event: MessageEvent<Request>) => {
  const message = event.data;

  if (message.type === "add") {
    personal.push(...message.words);
    for (const word of message.words) checker?.add(word);
    return;
  }

  let spell: ReturnType<typeof nspell>;
  try {
    spell = await ready();
  } catch (error) {
    scope.postMessage({
      id: message.id,
      type: "failed",
      message: error instanceof Error ? error.message : "The dictionary could not be loaded.",
    });
    return;
  }

  if (message.type === "check") {
    scope.postMessage({
      id: message.id,
      type: "checked",
      results: message.words.map((word) => [word, correct(spell, word)]),
    });
    return;
  }

  // Asked in lower case as well: a capitalised word at the start of a
  // sentence ("Teh") gets far worse candidates from the dictionary than the
  // same word in lower case, and the editor puts the capital back.
  const plain = message.word.replace(/’/g, "'");
  const lower = plain.toLowerCase();
  const candidates =
    lower === plain ? spell.suggest(plain) : [...spell.suggest(lower), ...spell.suggest(plain)];
  scope.postMessage({
    id: message.id,
    type: "suggested",
    suggestions: rankSuggestions(plain, candidates),
  });
};
