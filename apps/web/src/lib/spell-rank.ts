/**
 * Putting the likeliest correction first.
 *
 * The Hunspell dictionary finds good candidates and returns them in no useful
 * order: for "teh" it offers ten, eh, meh, tea, tech, ted, tee, tel and only
 * then "the". People mostly mistype common words, and mostly by one slip of
 * the finger — two letters swapped, one doubled or dropped. So candidates are
 * ordered by how many slips away they are (a swap counts as one), then by how
 * common the word is, and abbreviations in capitals are dropped unless the
 * word itself was typed in capitals.
 */

/** Typos common enough to know the answer to outright, including two-word fixes. */
const KNOWN_TYPOS: Record<string, string[]> = {
  alot: ["a lot", "allot"],
  teh: ["the"],
  hte: ["the"],
  adn: ["and"],
  nad: ["and"],
  taht: ["that"],
  wiht: ["with"],
  thier: ["their"],
  recieve: ["receive"],
  becuase: ["because"],
  becasue: ["because"],
  wierd: ["weird"],
  definately: ["definitely"],
  seperate: ["separate"],
  occured: ["occurred"],
  untill: ["until"],
  wrold: ["world"],
  goign: ["going"],
  jsut: ["just"],
  waht: ["what"],
  whcih: ["which"],
  peopel: ["people"],
  ahve: ["have"],
  yuo: ["you"],
  dont: ["don't"],
  cant: ["can't"],
  wont: ["won't"],
  didnt: ["didn't"],
  doesnt: ["doesn't"],
  isnt: ["isn't"],
  im: ["I'm"],
  ive: ["I've"],
  infact: ["in fact"],
  aswell: ["as well"],
  incase: ["in case"],
  atleast: ["at least"],
};

/**
 * The most common English words, most common first. A tie between two
 * equally close candidates goes to the more common one.
 */
const COMMON = `the of and to a in is it you that he was for on are with as I his they be at one
have this from or had by hot word but what some we can out other were all there when up use your how
said an each she which do their time if will way about many then them write would like so these her
long make thing see him two has look more day could go come did number sound no most people my over
know water than call first who may down side been now find any new work part take get place made live
where after back little only round man year came show every good me give our under name very through
just form sentence great think say help low line differ turn cause much mean before move right boy old
too same tell does set three want air well also play small end put home read hand port large spell add
even land here must big high such follow act why ask men change went light kind off need house picture
try us again animal point mother world near build self earth father head stand own page should country
found answer school grow study still learn plant cover food sun four between state keep eye never last
let thought city tree cross farm hard start might story saw far sea draw left late run while press close
night real life few north open seem together next white children begin got walk example ease paper group
always music those both mark often letter until mile river car feet care second book carry took science
eat room friend began idea fish mountain stop once base hear horse cut sure watch color face wood main
enough plain girl usual young ready above ever red list though feel talk bird soon body dog family direct
pose leave song measure door product black short numeral class wind question happen complete ship area
half rock order fire south problem piece told knew pass since top whole king space heard best hour better
true during hundred five remember step early hold west ground interest reach fast verb sing listen six
table travel less morning ten simple several vowel toward war lay against pattern slow center love person
money serve appear road map rain rule govern pull cold notice voice unit power town fine certain fly fall
lead cry dark machine note wait plan figure star box noun field rest correct able pound done beauty drive
stood contain front teach week final gave green oh quick develop ocean warm free minute strong special
mind behind clear tail produce fact street inch multiply nothing course stay wheel full force blue object
decide surface deep moon island foot system busy test record boat common gold possible plane stead dry
wonder laugh thousand ago ran check game shape equate miss brought heat snow tire bring yes distant fill
east paint language among because receive tomorrow weird definitely separate occurred going which have
people with that and`
  .split(/\s+/)
  .filter(Boolean);

const COMMON_RANK = new Map<string, number>();
COMMON.forEach((word, index) => {
  if (!COMMON_RANK.has(word.toLowerCase())) COMMON_RANK.set(word.toLowerCase(), index);
});

/** Edits between two words, where swapping two neighbouring letters counts as one. */
export function slips(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const rows = x.length + 1;
  const cols = y.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) d[i]![0] = i;
  for (let j = 0; j < cols; j += 1) d[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[x.length]![y.length]!;
}

/** Corrections for `word`, best first, at most `limit`. */
export function rankSuggestions(word: string, candidates: readonly string[], limit = 6): string[] {
  const lower = word.toLowerCase().replace(/’/g, "'");
  const shouted = word.length > 1 && word === word.toUpperCase();
  const known = KNOWN_TYPOS[lower] ?? [];

  const seen = new Set<string>();
  const pool: string[] = [];
  for (const candidate of [...known, ...candidates]) {
    const key = candidate.toLowerCase();
    if (seen.has(key) || key === lower) continue;
    // "NEH", "TX": abbreviations, which nobody typing "teh" meant.
    if (!shouted && candidate.length > 1 && candidate === candidate.toUpperCase()) continue;
    seen.add(key);
    pool.push(candidate);
  }

  const knownSet = new Set(known.map((entry) => entry.toLowerCase()));
  const score = (candidate: string) => {
    const key = candidate.toLowerCase();
    return {
      known: knownSet.has(key) ? 0 : 1,
      slips: slips(lower, key),
      common: COMMON_RANK.get(key) ?? Number.MAX_SAFE_INTEGER,
    };
  };

  return pool
    .map((candidate, index) => ({ candidate, index, ...score(candidate) }))
    .sort(
      (a, b) => a.known - b.known || a.slips - b.slips || a.common - b.common || a.index - b.index,
    )
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
