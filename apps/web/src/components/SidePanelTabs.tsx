"use client";

import { useRef } from "react";

/**
 * What the column beside the note is showing.
 *
 * One column, three things to put in it: the note's own details, the
 * assistant, and the conversation about the note. They used to be two
 * columns, which meant the document panel and the assistant could squeeze the
 * note from both sides at once — and a third would have left no note at all.
 */
export type SideView = "note" | "chat" | "assistant";

const VIEWS: { id: SideView; label: string; title: string; glyph: React.ReactNode }[] = [
  {
    id: "note",
    label: "Note",
    title: "Properties, export and history",
    glyph: (
      <>
        <rect x="2.75" y="1.75" width="10.5" height="12.5" rx="1.75" />
        <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
      </>
    ),
  },
  {
    id: "chat",
    label: "Chat",
    title: "Talk about this note with collaborators, in GitHub Discussions",
    glyph: (
      <path d="M2.5 4.25A1.75 1.75 0 0 1 4.25 2.5h7.5a1.75 1.75 0 0 1 1.75 1.75v5a1.75 1.75 0 0 1-1.75 1.75H7l-3 2.5V11h.25a1.75 1.75 0 0 1-1.75-1.75z" />
    ),
  },
  {
    id: "assistant",
    label: "Assistant",
    title: "Ask an AI about this note (⌥⌘A)",
    glyph: (
      <>
        <path d="M6.4 2.2 7.5 5l2.8 1.1L7.5 7.2 6.4 10 5.3 7.2 2.5 6.1 5.3 5z" />
        <path d="M11.6 8.6l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" />
      </>
    ),
  },
];

/**
 * The switch between the three.
 *
 * A tab strip, with the keyboard behaviour a tab strip is expected to have:
 * arrow keys move between tabs, Home and End go to either end. Chat carries
 * an unread count so a reply from a collaborator is visible from wherever
 * the column happens to be.
 */
export function SidePanelTabs({
  view,
  onChange,
  unread = 0,
}: {
  view: SideView;
  onChange: (view: SideView) => void;
  unread?: number;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (index: number) => {
    const next = VIEWS[(index + VIEWS.length) % VIEWS.length]!;
    onChange(next.id);
    tabs.current[VIEWS.indexOf(next)]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Beside the note"
      className="flex shrink-0 gap-1 border-b border-[var(--fl-border)] p-1.5"
    >
      {VIEWS.map((item, index) => {
        const selected = item.id === view;
        const badge = item.id === "chat" && unread > 0 && !selected;
        return (
          <button
            key={item.id}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`side-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`side-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            title={item.title}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(index + 1);
              else if (event.key === "ArrowLeft") move(index - 1);
              else if (event.key === "Home") move(0);
              else if (event.key === "End") move(VIEWS.length - 1);
              else return;
              event.preventDefault();
            }}
            className={`relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] transition-colors ${
              selected
                ? "bg-[var(--fl-elevated)] font-medium text-[var(--fl-text)] shadow-[var(--fl-shadow)]"
                : "text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
            }`}
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {item.glyph}
            </svg>
            <span className="truncate">{item.label}</span>
            {badge && (
              <span
                className="min-w-[1.1rem] rounded-full bg-[var(--fl-accent)] px-1 text-center text-[10px] leading-[1.1rem] font-semibold text-[var(--fl-accent-contrast)]"
                aria-label={`${unread} unread`}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
