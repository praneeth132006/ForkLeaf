"use client";

import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  cardLine,
  formatDeckBlock,
  parseDeckBlock,
  parseRepoAddress,
  planDeckUpdate,
  readDeckFile,
  type DeckCard,
  type DeckPlan,
} from "@forkleaf/markdown-engine";

/**
 * A deck you can fork, where the cards are.
 *
 * In a note of your own cards it shares them as a public GitHub repository and
 * later publishes what you change. In an empty note it copies somebody's shared
 * deck in as cards, and afterwards checks for a newer version and brings the
 * changes over — never touching a card you rewrote or one you added. Progress
 * is the reader's own schedule, so it is never shared.
 *
 * Stored as a ```deck fence naming the repository and the version.
 */

export interface DeckBridge {
  /** True when sharing is possible: signed in with GitHub. */
  signedIn: () => boolean;
  /** The title a shared deck gets. */
  noteTitle: () => string;
  /** Publishes cards (as `Question :: Answer` lines) and says where and at which commit. */
  share: (input: { title: string; cards: string; repo?: string }) => Promise<{
    repo: string;
    sha: string;
  }>;
  /** A shared deck's `deck.md`, now or at an earlier commit. */
  read: (repo: string, ref?: string) => Promise<{ sha: string; content: string }>;
}

export interface DeckBlockOptions {
  bridge: () => DeckBridge | undefined;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    deckBlock: {
      insertDeck: () => ReturnType;
    };
  }
}

type Busy = null | "share" | "copy" | "check" | "pull";
type Pending = { sha: string; plan: DeckPlan } | null;

const button =
  "rounded-lg border border-[var(--fl-border)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-50";
const primary =
  "rounded-lg bg-[var(--fl-accent)] px-3 py-1 text-[12.5px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)] disabled:opacity-50";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The note's top-level cards, where each is. */
function cardsIn(doc: ProseMirrorNode): { card: DeckCard; pos: number; node: ProseMirrorNode }[] {
  const found: { card: DeckCard; pos: number; node: ProseMirrorNode }[] = [];
  doc.forEach((child, offset) => {
    if (child.type.name !== "flashcard") return;
    found.push({
      card: {
        question: String(child.attrs.question ?? ""),
        answer: String(child.attrs.answer ?? ""),
        reversed: Boolean(child.attrs.reversed),
      },
      pos: offset,
      node: child,
    });
  });
  return found.filter((entry) => entry.card.question.trim() && entry.card.answer.trim());
}

function DeckNodeView({
  node,
  editor,
  getPos,
  extension,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const bridge = (extension.options as DeckBlockOptions).bridge();
  const role = (node.attrs.role as string) ?? "";
  const repo = (node.attrs.repo as string) ?? "";
  const version = (node.attrs.version as string) ?? "";
  const canEdit = editor.isEditable;

  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState<Pending>(null);

  const cards = cardsIn(editor.state.doc);
  const signedIn = bridge?.signedIn() ?? false;
  const target = parseRepoAddress(address);

  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(kind);
    setProblem(null);
    setMessage(null);
    try {
      await work();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  const share = () =>
    run("share", async () => {
      if (!bridge) return;
      const result = await bridge.share({
        title: bridge.noteTitle(),
        cards: cards.map((entry) => cardLine(entry.card)).join("\n"),
        ...(role === "shared" && repo ? { repo: repo.split("/")[1]! } : {}),
      });
      updateAttributes({ role: "shared", repo: result.repo, version: result.sha });
      setConfirming(false);
      setMessage(
        role === "shared"
          ? `Published ${plural(cards.length, "card")}.`
          : `Shared ${plural(cards.length, "card")} at github.com/${result.repo}.`,
      );
    });

  const copy = () =>
    run("copy", async () => {
      if (!bridge || !target) return;
      const name = `${target.owner}/${target.repo}`;
      const deck = await bridge.read(name);
      const incoming = readDeckFile(deck.content).cards;
      if (incoming.length === 0) throw new Error(`${name} has no cards in it.`);
      const position = typeof getPos === "function" ? getPos() : undefined;
      if (typeof position !== "number") return;
      const type = editor.schema.nodes.flashcard;
      if (!type) return;
      const have = new Set(cards.map((entry) => entry.card.question.trim().toLowerCase()));
      const fresh = incoming.filter((card) => !have.has(card.question.trim().toLowerCase()));
      const nodes = fresh.map((card, index) =>
        type.create({ ...card, joinedAbove: index > 0, joinedBelow: index < fresh.length - 1 }),
      );
      const tr = editor.state.tr;
      tr.setNodeMarkup(position, undefined, { role: "source", repo: name, version: deck.sha });
      if (nodes.length > 0) tr.insert(position + node.nodeSize, nodes);
      editor.view.dispatch(tr);
      setAddress("");
      setMessage(`Copied ${plural(fresh.length, "card")} from ${name}. Your progress stays yours.`);
    });

  const check = () =>
    run("check", async () => {
      if (!bridge) return;
      const latest = await bridge.read(repo);
      if (latest.sha === version) {
        setPending(null);
        setMessage("Up to date.");
        return;
      }
      const before = version ? readDeckFile((await bridge.read(repo, version)).content).cards : [];
      const plan = planDeckUpdate(
        cards.map((entry) => entry.card),
        before,
        readDeckFile(latest.content).cards,
      );
      const { added, changed, removed } = plan.changes;
      if (added.length + changed.length + removed.length === 0) {
        updateAttributes({ version: latest.sha });
        setMessage("Up to date.");
        return;
      }
      setPending({ sha: latest.sha, plan });
    });

  const pull = () =>
    run("pull", async () => {
      if (!pending) return;
      const position = typeof getPos === "function" ? getPos() : undefined;
      const type = editor.schema.nodes.flashcard;
      if (typeof position !== "number" || !type) return;
      const current = cardsIn(editor.state.doc);
      const { plan, sha } = pending;
      const tr = editor.state.tr;

      // From the bottom up, so each position is still where it was measured.
      const edits = [
        ...plan.replace.map((entry) => ({
          index: entry.index,
          card: entry.card as DeckCard | null,
        })),
        ...plan.remove.map((index) => ({ index, card: null })),
      ].sort((a, b) => b.index - a.index);
      for (const edit of edits) {
        const entry = current[edit.index];
        if (!entry) continue;
        if (edit.card)
          tr.setNodeMarkup(entry.pos, undefined, { ...entry.node.attrs, ...edit.card });
        else tr.delete(entry.pos, entry.pos + entry.node.nodeSize);
      }

      if (plan.add.length > 0) {
        const anchor = plan.anchor === null ? null : current[plan.anchor];
        const at = anchor
          ? tr.mapping.map(anchor.pos + anchor.node.nodeSize)
          : tr.mapping.map(position + node.nodeSize);
        tr.insert(
          at,
          plan.add.map((card, index) =>
            type.create({
              ...card,
              joinedAbove: anchor !== null || index > 0,
              joinedBelow: index < plan.add.length - 1,
            }),
          ),
        );
      }
      tr.setNodeMarkup(tr.mapping.map(position), undefined, { role, repo, version: sha });
      editor.view.dispatch(tr);

      const { added, changed, removed } = plan.changes;
      setPending(null);
      setMessage(
        `Brought in ${plural(added.length, "new card")}, ${changed.length} changed, ${removed.length} removed.` +
          (plan.kept > 0
            ? ` ${plural(plan.kept, "card")} you rewrote ${plan.kept === 1 ? "is" : "are"} kept as you wrote ${plan.kept === 1 ? "it" : "them"}.`
            : ""),
      );
    });

  const link = repo ? (
    <a
      href={`https://github.com/${repo}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[var(--fl-accent)] underline-offset-2 hover:underline"
    >
      github.com/{repo}
    </a>
  ) : null;

  return (
    <NodeViewWrapper className="fl-deck-node my-4" data-type="deck" contentEditable={false}>
      <div
        className={`rounded-xl border bg-[var(--fl-surface)] ${
          selected ? "border-[var(--fl-accent)]" : "border-[var(--fl-border)]"
        }`}
      >
        <div
          className="flex items-center gap-2 border-b border-[var(--fl-border)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--fl-muted)]"
          data-drag-handle
        >
          <span>Shared deck</span>
          <span className="normal-case tracking-normal">
            · {plural(cards.length, "card")} in this note
          </span>
        </div>

        <div className="grid gap-3 p-3 text-[14px]">
          {!bridge && <p className="text-[var(--fl-muted)]">Sharing decks needs a notebook.</p>}

          {bridge && role === "" && (
            <>
              <div className="grid gap-2">
                <p className="font-medium text-[var(--fl-text)]">Share the cards in this note</p>
                {!signedIn ? (
                  <p className="text-[13px] text-[var(--fl-muted)]">
                    Sign in with GitHub to share a deck as a public repository.
                  </p>
                ) : cards.length === 0 ? (
                  <p className="text-[13px] text-[var(--fl-muted)]">
                    Add some <code>Question :: Answer</code> cards to this note first.
                  </p>
                ) : confirming ? (
                  <div
                    className="grid gap-2 rounded-lg border border-[var(--fl-border)] p-2.5"
                    role="alertdialog"
                    aria-label="Share publicly?"
                  >
                    <p className="text-[13px] leading-relaxed text-[var(--fl-text)]">
                      This makes a <strong>public</strong> GitHub repository that anyone can see,
                      holding the {plural(cards.length, "card")} in this note — and nothing else
                      from it. Share?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy !== null || !canEdit}
                        onClick={() => void share()}
                        className={primary}
                      >
                        {busy === "share" ? "Sharing…" : "Share publicly"}
                      </button>
                      <button type="button" onClick={() => setConfirming(false)} className={button}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setConfirming(true)}
                    className={`${button} justify-self-start`}
                  >
                    Share as a public repository
                  </button>
                )}
              </div>

              <form
                className="grid gap-2 border-t border-[var(--fl-border)] pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (target) void copy();
                }}
              >
                <label className="grid gap-1 font-medium text-[var(--fl-text)]">
                  Copy a shared deck
                  <input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="owner/repo, or its GitHub link"
                    aria-label="Shared deck address"
                    className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2.5 py-1.5 text-[14px] font-normal text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={!target || busy !== null || !canEdit}
                  className={`${button} justify-self-start`}
                >
                  {busy === "copy" ? "Copying…" : "Copy the cards here"}
                </button>
              </form>
            </>
          )}

          {bridge && role === "shared" && (
            <div className="grid gap-2">
              <p className="text-[var(--fl-text)]">Shared at {link}.</p>
              <p className="text-[12.5px] text-[var(--fl-muted)]">
                Anyone can copy it. Change the cards here, then publish so copies can pull the
                changes in.
              </p>
              <button
                type="button"
                disabled={busy !== null || !signedIn || !canEdit || cards.length === 0}
                onClick={() => void share()}
                className={`${button} justify-self-start`}
              >
                {busy === "share" ? "Publishing…" : "Publish changes"}
              </button>
            </div>
          )}

          {bridge && role === "source" && (
            <div className="grid gap-2">
              <p className="text-[var(--fl-text)]">Copied from {link}.</p>
              {pending ? (
                <div
                  className="grid gap-2 rounded-lg border border-[var(--fl-border)] p-2.5"
                  data-testid="deck-update"
                >
                  <p className="text-[13px] text-[var(--fl-text)]">
                    A newer version: {plural(pending.plan.changes.added.length, "new card")},{" "}
                    {pending.plan.changes.changed.length} changed,{" "}
                    {pending.plan.changes.removed.length} removed.
                    {pending.plan.kept > 0 &&
                      ` ${plural(pending.plan.kept, "card")} you rewrote will be left as you wrote ${pending.plan.kept === 1 ? "it" : "them"}.`}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy !== null || !canEdit}
                      onClick={() => void pull()}
                      className={primary}
                    >
                      Pull them in
                    </button>
                    <button type="button" onClick={() => setPending(null)} className={button}>
                      Not now
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void check()}
                  className={`${button} justify-self-start`}
                >
                  {busy === "check" ? "Checking…" : "Check for updates"}
                </button>
              )}
            </div>
          )}

          {message && (
            <p role="status" className="text-[12.5px] text-[var(--fl-muted)]">
              {message}
            </p>
          )}
          {problem && (
            <p role="alert" className="text-[12.5px] text-[var(--fl-danger)]">
              {problem}
            </p>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const DeckBlock = Node.create<DeckBlockOptions>({
  name: "deckBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { bridge: () => undefined };
  },

  addAttributes() {
    return {
      role: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-role") ?? "",
        renderHTML: (attributes) => ({ "data-role": attributes.role as string }),
      },
      repo: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-repo") ?? "",
        renderHTML: (attributes) => ({ "data-repo": attributes.repo as string }),
      },
      version: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-version") ?? "",
        renderHTML: (attributes) => ({ "data-version": attributes.version as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="deck"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "deck" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DeckNodeView);
  },

  addCommands() {
    return {
      insertDeck:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: SerializerState,
          node: { attrs: { role?: string; repo?: string; version?: string } },
        ) {
          const body = formatDeckBlock({
            role:
              node.attrs.role === "source" || node.attrs.role === "shared" ? node.attrs.role : "",
            repo: node.attrs.repo ?? "",
            version: node.attrs.version ?? "",
          });
          state.write("```deck\n");
          if (body) {
            state.text(body, false);
            state.ensureNewLine();
          }
          state.write("```");
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const code of Array.from(
              element.querySelectorAll<HTMLElement>("pre > code.language-deck"),
            )) {
              const deck = parseDeckBlock(code.textContent ?? "");
              const replacement = element.ownerDocument.createElement("div");
              replacement.setAttribute("data-type", "deck");
              replacement.setAttribute("data-role", deck.role);
              replacement.setAttribute("data-repo", deck.repo);
              replacement.setAttribute("data-version", deck.version);
              code.parentElement?.replaceWith(replacement);
            }
          },
        },
      },
    };
  },
});

interface SerializerState {
  write(text: string): void;
  text(text: string, escape?: boolean): void;
  ensureNewLine(): void;
  closeBlock(node: unknown): void;
}
