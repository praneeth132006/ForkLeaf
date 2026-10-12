import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * The auto-glossary, in the text being written.
 *
 * Every term the notebook defines somewhere gets a faint dotted underline
 * wherever it appears. Hovering it — or tapping it, on a phone — shows the
 * definition and the note it came from, with a way to open that note. The
 * note's text is never touched.
 *
 * Which terms exist is the app's to know; this finds them in the text and
 * draws the card.
 */

export interface GlossaryDefinition {
  term: string;
  definition: string;
  /** The note it is defined in, by title. */
  source: string;
  path: string;
  line: number;
  /** How many other notes define the same term. */
  others: number;
}

export interface GlossaryBridge {
  enabled: boolean;
  /** Changes when the glossary does, so the underlines are redrawn. */
  version: number;
  match: (text: string) => Array<{ from: number; to: number; key: string }>;
  lookup: (key: string) => GlossaryDefinition | undefined;
  open: (path: string, line: number) => void;
}

export interface GlossaryOptions {
  bridge: () => GlossaryBridge | undefined;
}

export const glossaryKey = new PluginKey<DecorationSet>("forkleaf-glossary");

const SKIPPED = new Set(["codeBlock", "mermaidBlock", "heading"]);
/** Code is not prose; bold is usually the definition itself; a link already goes somewhere. */
const SKIPPED_MARKS = new Set(["code", "bold", "link"]);

const cache = new WeakMap<
  ProseMirrorNode,
  { version: number; hits: ReturnType<GlossaryBridge["match"]> }
>();

function hitsIn(node: ProseMirrorNode, bridge: GlossaryBridge) {
  const cached = cache.get(node);
  if (cached && cached.version === bridge.version) return cached.hits;
  let text = "";
  node.forEach((child) => {
    if (child.isText) {
      const skip = child.marks.some((mark) => SKIPPED_MARKS.has(mark.type.name));
      text += skip ? " ".repeat(child.text!.length) : child.text!;
    } else {
      text += " ".repeat(child.nodeSize);
    }
  });
  const hits = bridge.match(text);
  cache.set(node, { version: bridge.version, hits });
  return hits;
}

export function glossaryDecorations(
  state: EditorState,
  bridge: GlossaryBridge | undefined,
): DecorationSet {
  if (!bridge?.enabled) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (SKIPPED.has(node.type.name)) return false;
    if (!node.isTextblock) return true;
    for (const hit of hitsIn(node, bridge)) {
      const entry = bridge.lookup(hit.key);
      if (!entry) continue;
      decorations.push(
        Decoration.inline(pos + 1 + hit.from, pos + 1 + hit.to, {
          class: "fl-glossary-term",
          "data-glossary": hit.key,
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
}

export const Glossary = Extension.create<GlossaryOptions>({
  name: "glossary",

  addOptions() {
    return { bridge: () => undefined };
  },

  addProseMirrorPlugins() {
    const bridgeOf = this.options.bridge;
    return [
      new Plugin<DecorationSet>({
        key: glossaryKey,
        state: {
          init: (_config, state) => glossaryDecorations(state, bridgeOf()),
          apply: (tr, previous, _old, state) =>
            tr.docChanged || tr.getMeta(glossaryKey) !== undefined
              ? glossaryDecorations(state, bridgeOf())
              : previous,
        },
        props: {
          decorations: (state) => glossaryKey.getState(state),
        },
        view: (view) => new GlossaryCard(view, bridgeOf),
      }),
    ];
  },
});

/** The definition card, shown on hover or tap. */
class GlossaryCard {
  private card: HTMLDivElement | null = null;
  private key: string | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly onOver = (event: Event) => {
    const term = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-glossary]");
    if (term && this.view.dom.contains(term)) this.show(term);
  };
  private readonly onOut = (event: Event) => {
    const term = (event.target as HTMLElement | null)?.closest?.("[data-glossary]");
    if (term) this.scheduleHide();
  };
  private readonly onTap = (event: Event) => {
    const term = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-glossary]");
    if (term && this.view.dom.contains(term)) this.show(term);
    else this.hide();
  };
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.hide();
  };

  constructor(
    private readonly view: EditorView,
    private readonly bridgeOf: () => GlossaryBridge | undefined,
  ) {
    view.dom.addEventListener("mouseover", this.onOver);
    view.dom.addEventListener("mouseout", this.onOut);
    view.dom.addEventListener("click", this.onTap);
    view.dom.addEventListener("keydown", this.onKey);
  }

  update(): void {
    if (!this.bridgeOf()?.enabled) this.hide();
  }

  private show(element: HTMLElement): void {
    const bridge = this.bridgeOf();
    const key = element.dataset.glossary;
    if (!bridge?.enabled || !key) return;
    const entry = bridge.lookup(key);
    if (!entry) return;
    this.cancelHide();
    if (this.card && this.key === key) return;
    this.hide();

    const document = element.ownerDocument;
    const card = document.createElement("div");
    card.className = "fl-glossary-card";
    card.setAttribute("role", "tooltip");
    card.dataset.testid = "glossary-card";
    card.addEventListener("mouseenter", () => this.cancelHide());
    card.addEventListener("mouseleave", () => this.scheduleHide());
    card.addEventListener("mousedown", (event) => event.preventDefault());

    const term = document.createElement("strong");
    term.className = "fl-glossary-card-term";
    term.textContent = entry.term;
    const definition = document.createElement("p");
    definition.className = "fl-glossary-card-definition";
    definition.textContent = entry.definition;
    const source = document.createElement("button");
    source.type = "button";
    source.className = "fl-glossary-card-source";
    source.textContent =
      entry.others > 0
        ? `${entry.source} · and ${entry.others} other note${entry.others === 1 ? "" : "s"}`
        : entry.source;
    source.addEventListener("click", (event) => {
      event.preventDefault();
      this.hide();
      bridge.open(entry.path, entry.line);
    });

    card.append(term, definition, source);
    document.body.append(card);
    this.card = card;
    this.key = key;

    const rect = element.getBoundingClientRect();
    const view = document.defaultView;
    const width = card.offsetWidth || 280;
    const left = Math.max(8, Math.min(rect.left, (view?.innerWidth ?? 1024) - width - 8));
    const height = card.offsetHeight || 100;
    const below = rect.bottom + 6;
    const top =
      view && below + height > view.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  private scheduleHide(): void {
    this.cancelHide();
    this.hideTimer = setTimeout(() => this.hide(), 250);
  }

  private cancelHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  hide(): void {
    this.cancelHide();
    this.card?.remove();
    this.card = null;
    this.key = null;
  }

  destroy(): void {
    this.hide();
    this.view.dom.removeEventListener("mouseover", this.onOver);
    this.view.dom.removeEventListener("mouseout", this.onOut);
    this.view.dom.removeEventListener("click", this.onTap);
    this.view.dom.removeEventListener("keydown", this.onKey);
  }
}
