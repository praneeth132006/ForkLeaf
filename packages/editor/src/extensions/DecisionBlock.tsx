"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  choose,
  emptyDecision,
  formatDecision,
  leading,
  parseDecision,
  scoreOf,
  type Decision,
  type Point,
} from "@forkleaf/markdown-engine";

/**
 * A decision, worked out in the note.
 *
 * Options side by side, each with pros and cons weighed 1 to 3 and a score;
 * the leader picked out; a Choose button that records the choice with the date
 * and the scores at the time, so changing your mind later keeps the history.
 * Stored as a ```decision block of plain lines — see the engine's `decision`.
 */

export interface DecisionBlockOptions {
  /** Today, as `YYYY-MM-DD`. */
  today: () => string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    decisionBlock: {
      insertDecision: () => ReturnType;
    };
  }
}

const localToday = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const field =
  "min-w-0 rounded-md border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-[13.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)] disabled:opacity-70";
const small =
  "rounded-md border border-[var(--fl-border)] px-2 py-0.5 text-[12px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-50";

function DecisionNodeView({ node, updateAttributes, editor, extension, selected }: NodeViewProps) {
  const decision = parseDecision((node.attrs.text as string) ?? "");
  const canEdit = editor.isEditable;
  const today = (extension.options as DecisionBlockOptions).today;

  const save = (next: Decision) => {
    if (canEdit) updateAttributes({ text: formatDecision(next) });
  };
  const withOption = (
    index: number,
    change: (option: Decision["options"][number]) => Decision["options"][number],
  ) =>
    save({
      ...decision,
      options: decision.options.map((option, at) => (at === index ? change(option) : option)),
    });

  const top = leading(decision);
  const latest = decision.history.at(-1);

  const pointRows = (index: number, kind: "pros" | "cons") => {
    const option = decision.options[index]!;
    const label = kind === "pros" ? "Pro" : "Con";
    return (
      <div className="grid gap-1">
        {option[kind].map((entry, at) => (
          <div key={at} className="flex min-w-0 items-center gap-1">
            <span
              aria-hidden="true"
              className={`w-3 text-center text-[13px] font-semibold ${kind === "pros" ? "text-[#30a46c]" : "text-[var(--fl-danger)]"}`}
            >
              {kind === "pros" ? "+" : "−"}
            </span>
            <input
              value={entry.text}
              disabled={!canEdit}
              aria-label={`${label} ${at + 1} of ${option.name}`}
              onChange={(event) =>
                withOption(index, (current) => ({
                  ...current,
                  [kind]: current[kind].map((each, i) =>
                    i === at ? { ...each, text: event.target.value } : each,
                  ),
                }))
              }
              className={`${field} w-0 flex-1`}
            />
            <select
              value={entry.weight}
              disabled={!canEdit}
              aria-label={`Weight of ${label.toLowerCase()} ${at + 1} of ${option.name}`}
              onChange={(event) =>
                withOption(index, (current) => ({
                  ...current,
                  [kind]: current[kind].map((each, i) =>
                    i === at
                      ? { ...each, weight: Number(event.target.value) as Point["weight"] }
                      : each,
                  ),
                }))
              }
              className={`${field} w-12 shrink-0 px-1`}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
            {canEdit && (
              <button
                type="button"
                aria-label={`Remove ${label.toLowerCase()} ${at + 1} of ${option.name}`}
                onClick={() =>
                  withOption(index, (current) => ({
                    ...current,
                    [kind]: current[kind].filter((_, i) => i !== at),
                  }))
                }
                className="px-1 text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={() =>
              withOption(index, (current) => ({
                ...current,
                [kind]: [...current[kind], { text: "", weight: 1 }],
              }))
            }
            className={`${small} justify-self-start`}
          >
            + {label} for {option.name || "this option"}
          </button>
        )}
      </div>
    );
  };

  return (
    <NodeViewWrapper className="fl-decision-node my-5" data-type="decision" contentEditable={false}>
      <div
        className={`rounded-xl border bg-[var(--fl-surface)] ${
          selected ? "border-[var(--fl-accent)]" : "border-[var(--fl-border)]"
        }`}
      >
        <div
          className="flex items-center gap-2 border-b border-[var(--fl-border)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--fl-muted)]"
          data-drag-handle
        >
          <span>Decision</span>
          {decision.chosen && (
            <span className="normal-case tracking-normal" data-testid="decision-chosen">
              · chosen: {decision.chosen}
            </span>
          )}
        </div>

        <div className="grid gap-3 p-3 text-[14px]">
          <input
            value={decision.question}
            disabled={!canEdit}
            placeholder="What are you deciding?"
            aria-label="Decision question"
            onChange={(event) => save({ ...decision, question: event.target.value })}
            className={`${field} text-[16px] font-medium`}
          />

          {/* Two across when the note has room, one under another when it has not. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
            {decision.options.map((option, index) => {
              const score = scoreOf(option);
              const isChosen = decision.chosen !== "" && option.name === decision.chosen;
              return (
                <section
                  key={index}
                  aria-label={`Option: ${option.name}`}
                  className={`grid min-w-0 content-start gap-2 rounded-lg border p-2.5 ${
                    isChosen
                      ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
                      : "border-[var(--fl-border)]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <input
                      value={option.name}
                      disabled={!canEdit}
                      aria-label={`Option ${index + 1} name`}
                      onChange={(event) => {
                        const name = event.target.value;
                        save({
                          ...decision,
                          chosen: decision.chosen === option.name ? name : decision.chosen,
                          options: decision.options.map((each, at) =>
                            at === index ? { ...each, name } : each,
                          ),
                        });
                      }}
                      className={`${field} w-0 flex-1 font-medium`}
                    />
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
                        score > 0
                          ? "text-[#30a46c]"
                          : score < 0
                            ? "text-[var(--fl-danger)]"
                            : "text-[var(--fl-muted)]"
                      }`}
                      data-testid="decision-score"
                    >
                      {score > 0 ? `+${score}` : score}
                    </span>
                    {canEdit && decision.options.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove option ${option.name}`}
                        onClick={() =>
                          save({
                            ...decision,
                            options: decision.options.filter((_, at) => at !== index),
                            chosen: isChosen ? "" : decision.chosen,
                          })
                        }
                        className="px-1 text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {pointRows(index, "pros")}
                  {pointRows(index, "cons")}
                  {top === option && !isChosen && (
                    <p className="text-[12px] text-[var(--fl-muted)]">Highest score</p>
                  )}
                  <button
                    type="button"
                    disabled={!canEdit || isChosen || !option.name.trim()}
                    onClick={() => save(choose(decision, option.name, today()))}
                    className={`${small} justify-self-start`}
                  >
                    {isChosen ? "Chosen" : `Choose ${option.name || "this option"}`}
                  </button>
                </section>
              );
            })}
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() =>
                save({
                  ...decision,
                  options: [
                    ...decision.options,
                    {
                      name: `Option ${String.fromCharCode(65 + decision.options.length)}`,
                      pros: [],
                      cons: [],
                    },
                  ],
                })
              }
              className={`${small} justify-self-start`}
            >
              + Add an option
            </button>
          )}

          {latest && (
            <div className="border-t border-[var(--fl-border)] pt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fl-muted)]">
                History
              </p>
              <ol
                className="grid gap-0.5 text-[12.5px] text-[var(--fl-muted)]"
                data-testid="decision-history"
              >
                {decision.history.map((entry, index) => (
                  <li key={index}>{entry}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const DecisionBlock = Node.create<DecisionBlockOptions>({
  name: "decisionBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { today: localToday };
  },

  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-text") ?? "",
        renderHTML: (attributes) => ({ "data-text": attributes.text as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="decision"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "decision" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DecisionNodeView);
  },

  addCommands() {
    return {
      insertDecision:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { text: formatDecision(emptyDecision()) },
          }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: { text?: string } }) {
          const text = formatDecision(parseDecision(node.attrs.text ?? ""));
          state.write("```decision\n");
          state.text(text, false);
          state.ensureNewLine();
          state.write("```");
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const code of Array.from(
              element.querySelectorAll<HTMLElement>("pre > code.language-decision"),
            )) {
              const replacement = element.ownerDocument.createElement("div");
              replacement.setAttribute("data-type", "decision");
              replacement.setAttribute("data-text", (code.textContent ?? "").replace(/\n$/, ""));
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
