/**
 * Spelling, the part both editors share.
 *
 * Which words in a stretch of text are worth checking, and the little bubble
 * that offers corrections. The dictionary itself is the app's: it lives in a
 * worker, answers asynchronously, and reaches the editors through
 * `SpellBridge`. Everything here is synchronous and pure, so the rich editor
 * and the source editor find exactly the same words and skip exactly the same
 * things.
 */

export interface SpellBridge {
  /** Whether spelling suggestions are switched on. */
  enabled: boolean;
  /**
   * Changes whenever the bridge has learnt something new about some words, so
   * underlines painted from an older answer can be redrawn.
   */
  version: number;
  /**
   * What is known about a word right now: `false` when it is misspelt, `true`
   * when it is fine, `undefined` when it has not been checked yet.
   */
  check: (word: string) => boolean | undefined;
  /**
   * Asks for words to be checked. Answers arrive later, as a new `version`.
   * Asking about a word already being checked does nothing, so callers need
   * not keep track.
   */
  request: (words: readonly string[]) => void;
  /** Likely corrections, best first. */
  suggest: (word: string) => Promise<readonly string[]>;
  /** Adds a word to this person's dictionary for good. */
  learn: (word: string) => void;
  /** Stops underlining a word until the page is reloaded. */
  ignore: (word: string) => void;
}

export interface FoundWord {
  word: string;
  /** Offsets into the text that was searched. */
  from: number;
  to: number;
}

/** A run of letters, with apostrophes allowed inside: don't, rock'n'roll. */
const WORD = /\p{L}[\p{L}\p{M}'’]*/gu;

/**
 * Runs of text that are not prose, wherever they appear.
 *
 * Addresses, emails, file names, wikilinks, inline code and HTML are not
 * words to be spelt, and underlining them would make every technical note a
 * sea of red.
 */
const NOT_PROSE = [
  /`[^`\n]*`/g, // inline code
  /\[\[[^\]\n]*\]\]/g, // [[wikilinks]]
  /\]\([^)\n]*\)/g, // the address half of [text](address)
  /<[^>\n]*>/g, // HTML tags and <autolinks>
  /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, // URLs
  /\bwww\.\S+/gi,
  /\S+@\S+\.\S+/g, // email addresses
  /(?:^|\s)[#@][\p{L}\p{N}_/-]+/gu, // #tags and @mentions
  /\$[^$\n]+\$/g, // inline maths
  /[^\s()[\]]*[\p{L}\p{N}][_/\\][\p{L}\p{N}][^\s()[\]]*/gu, // snake_case, paths
  /[^\s()[\]]*\p{L}\.\p{L}[^\s()[\]]*/gu, // file.names and domain.names
  /\{\{[^}\n]*\}\}/g, // template fields
];

/**
 * Whether a single word should be looked up at all.
 *
 * Acronyms (API, NASA), mixed case (iPhone, GitHub, camelCase) and single
 * letters are left alone: a dictionary cannot know them, and they are almost
 * always written that way on purpose.
 */
export function worthChecking(word: string): boolean {
  if (word.length < 2 || word.length > 40) return false;
  const letters = word.replace(/['’]/g, "");
  if (letters.length < 2) return false;
  // ALL CAPS
  if (letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return false;
  // A capital anywhere but the start: camelCase, iPhone, McDonald, GitHub.
  if (/\p{Lu}/u.test(letters.slice(1))) return false;
  return true;
}

/** Spans of `text` that are code, links, addresses and the like. */
export function skippedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pattern of NOT_PROSE) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      ranges.push([match.index!, match.index! + match[0].length]);
    }
  }
  return ranges;
}

/** Every word in `text` worth checking, outside code, links and addresses. */
export function findWords(text: string): FoundWord[] {
  const skipped = skippedRanges(text);
  const words: FoundWord[] = [];

  for (const match of text.matchAll(WORD)) {
    // A trailing apostrophe is punctuation — the closing quote of 'word' — not
    // part of the word.
    const word = match[0].replace(/['’]+$/, "");
    const from = match.index!;
    const to = from + word.length;

    // Letters glued to digits are an identifier (h2o, v14, 3rd), not a word.
    const before = text[from - 1];
    const after = text[to];
    if ((before && /[\p{N}_]/u.test(before)) || (after && /[\p{N}_]/u.test(after))) continue;
    if (skipped.some(([start, end]) => from < end && to > start)) continue;
    if (!worthChecking(word)) continue;

    words.push({ word, from, to });
  }

  return words;
}

/**
 * A correction in the case the writer used.
 *
 * "Teh" at the start of a sentence becomes "The", not "the". A dictionary's
 * own capitalisation wins when it has one — "english" becomes "English".
 */
export function matchCase(original: string, suggestion: string): string {
  if (suggestion !== suggestion.toLowerCase()) return suggestion;
  if (original.length > 1 && original === original.toUpperCase()) return suggestion.toUpperCase();
  const first = original[0];
  if (first && first !== first.toLowerCase()) {
    return suggestion[0]!.toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

/** The word in `text` that covers offset `at`, if any — including when `at` sits just after it. */
export function wordAt(words: readonly FoundWord[], at: number): FoundWord | undefined {
  return words.find((word) => at >= word.from && at <= word.to);
}

/**
 * Whether the text typed since a word was finished still leaves it "just
 * finished": a space and a little punctuation, no more. The first letter of
 * the next word means the writer has moved on, and the bubble should too.
 */
export function stillJustAfter(gap: string): boolean {
  return /^[\s.,;:!?)\]"”’]{0,3}$/.test(gap);
}

// ─── The suggestion bubble ───────────────────────────────────────────────────

export interface BubbleRequest {
  word: string;
  /** Viewport coordinates of the word, to sit under. */
  rect: { left: number; bottom: number; top: number };
  suggestions: readonly string[] | null;
  onPick: (replacement: string) => void;
  onLearn: () => void;
  onIgnore: () => void;
}

/**
 * The bubble under a misspelt word: corrections first, then "Add to
 * dictionary" and "Ignore".
 *
 * Plain DOM rather than React, because both editors own their own rendering
 * and this has to float over either. One bubble per page; showing it for a
 * new word replaces the old one.
 *
 * It works from the keyboard without taking focus from the editor: the arrow
 * keys move a highlight through the choices and Enter or Tab takes the
 * highlighted one. Until something is highlighted every key but ↓ and ↑ goes
 * to the editor as usual, so typing carries on undisturbed.
 */
export class SuggestionBubble {
  private element: HTMLDivElement | null = null;
  private current: string | null = null;
  private choices: HTMLButtonElement[] = [];
  private active = -1;

  /** The word the bubble is open for, or null. */
  get word(): string | null {
    return this.current;
  }

  get visible(): boolean {
    return this.element !== null;
  }

  show(request: BubbleRequest): void {
    const document = globalThis.document;
    if (!document) return;
    this.hide();

    const bubble = document.createElement("div");
    bubble.className = "fl-spell-bubble";
    bubble.setAttribute("role", "listbox");
    bubble.setAttribute("aria-label", `Spelling suggestions for ${request.word}`);
    bubble.dataset.testid = "spell-bubble";
    // Keep the caret where it is: a mousedown on the bubble would otherwise
    // blur the editor and move the selection before the click lands.
    bubble.addEventListener("mousedown", (event) => event.preventDefault());

    const list = document.createElement("div");
    list.className = "fl-spell-suggestions";
    const suggestions = request.suggestions;

    if (suggestions === null) {
      list.append(text(document, "fl-spell-note", "Looking for suggestions…"));
    } else if (suggestions.length === 0) {
      list.append(text(document, "fl-spell-note", "No suggestions"));
    } else {
      for (const suggestion of suggestions.slice(0, 5)) {
        list.append(
          button(document, "fl-spell-option", suggestion, () => {
            this.hide();
            request.onPick(suggestion);
          }),
        );
      }
    }

    const actions = document.createElement("div");
    actions.className = "fl-spell-actions";
    actions.append(
      button(document, "fl-spell-action", "Add to dictionary", () => {
        this.hide();
        request.onLearn();
      }),
      button(document, "fl-spell-action", "Ignore", () => {
        this.hide();
        request.onIgnore();
      }),
    );

    bubble.append(list, actions);
    document.body.append(bubble);
    this.element = bubble;
    this.current = request.word;
    this.choices = Array.from(bubble.querySelectorAll("button"));
    this.choices.forEach((choice, index) => {
      choice.id = `fl-spell-choice-${index}`;
      choice.setAttribute("role", "option");
      choice.setAttribute("aria-selected", "false");
    });
    this.place(request.rect);
  }

  /**
   * A key pressed in the editor while the bubble is open. Returns true when
   * the bubble used it, so the editor should not.
   */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.element || this.choices.length === 0) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false;
    const last = this.choices.length - 1;
    const highlighted = this.active >= 0;

    switch (event.key) {
      case "ArrowDown":
        this.highlight(highlighted ? Math.min(this.active + 1, last) : 0);
        return true;
      case "ArrowUp":
        this.highlight(highlighted ? Math.max(this.active - 1, 0) : last);
        return true;
      case "ArrowRight":
        if (!highlighted) return false;
        this.highlight(Math.min(this.active + 1, last));
        return true;
      case "ArrowLeft":
        if (!highlighted) return false;
        this.highlight(Math.max(this.active - 1, 0));
        return true;
      case "Enter":
      case "Tab":
        if (!highlighted || event.shiftKey) return false;
        this.choices[this.active]!.click();
        return true;
      default:
        // Anything else is typing: let go of the highlight and carry on.
        if (highlighted) this.highlight(-1);
        return false;
    }
  }

  private highlight(index: number): void {
    this.choices[this.active]?.classList.remove("is-active");
    this.choices[this.active]?.setAttribute("aria-selected", "false");
    this.active = index;
    const choice = this.choices[index];
    if (choice) {
      choice.classList.add("is-active");
      choice.setAttribute("aria-selected", "true");
      this.element?.setAttribute("aria-activedescendant", choice.id);
    } else {
      this.element?.removeAttribute("aria-activedescendant");
    }
  }

  /** Moves the bubble to follow its word, e.g. while the page scrolls. */
  place(rect: BubbleRequest["rect"]): void {
    const bubble = this.element;
    if (!bubble) return;
    const view = globalThis.window;
    const width = bubble.offsetWidth || 220;
    const height = bubble.offsetHeight || 80;
    const left = Math.max(8, Math.min(rect.left, (view?.innerWidth ?? 1024) - width - 8));
    // Below the word, unless that would leave the screen; then above it.
    const below = rect.bottom + 6;
    const top =
      view && below + height > view.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  hide(): void {
    this.element?.remove();
    this.element = null;
    this.current = null;
    this.choices = [];
    this.active = -1;
  }
}

function button(
  document: Document,
  className: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", (event) => {
    event.preventDefault();
    onClick();
  });
  return element;
}

function text(document: Document, className: string, value: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = value;
  return element;
}
