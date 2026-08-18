"use client";

import { cheatsheetFor, expandSnippet, type DiagramKind } from "@forkleaf/diagrams";

export interface CheatsheetProps {
  kind: DiagramKind | null;
  /** Inserts the snippet at the cursor. */
  onInsert: (snippet: string) => void;
}

/**
 * A syntax reference that sits beside the editor.
 *
 * Every row is clickable and inserts working syntax, so it doubles as a palette
 * — the point is never having to leave the app to look up how an ERD
 * relationship is spelled.
 */
export function Cheatsheet({ kind, onInsert }: CheatsheetProps) {
  const sections = cheatsheetFor(kind);

  return (
    <div className="h-full overflow-y-auto p-3 text-sm">
      <p className="mb-3 text-xs leading-snug text-[var(--fl-muted)]">
        {kind
          ? `Syntax for ${kind} diagrams. Click any row to insert it.`
          : "Pick a diagram type to start. Click any row to insert it."}
      </p>

      {sections.map((section) => (
        <section key={section.section} className="mb-4">
          <h4 className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
            {section.section}
          </h4>

          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => onInsert(expandSnippet(item.snippet).text)}
                  title={`Insert: ${expandSnippet(item.snippet).text}`}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--fl-elevated)] focus:bg-[var(--fl-elevated)] focus:outline-none"
                >
                  <span className="text-[var(--fl-text)]">{item.label}</span>
                  <code className="font-mono text-[0.7rem] text-[var(--fl-muted)]">
                    {item.detail}
                  </code>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
