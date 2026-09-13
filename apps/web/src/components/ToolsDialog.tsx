"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import type { Command } from "@/components/CommandPalette";

/**
 * Every command in the editor, as buttons.
 *
 * ⌘K is fast once you know what to type, and useless before that: a feature
 * whose only door is a shortcut or a phrase in a search box is invisible to
 * anyone who has not read about it. This is the same list the palette runs,
 * laid out so it can be browsed and clicked, with each shortcut shown beside
 * its command so the keyboard route is learned by using the mouse one.
 */

export interface ToolsDialogProps {
  commands: readonly Command[];
  onClose: () => void;
}

/**
 * A command's hint is either a shortcut (`⌘⇧N`) or a short description of what
 * it does. Shortcuts sit in a key cap on the right; descriptions go under the
 * label, where a sentence has room.
 */
export const isShortcut = (hint: string) =>
  hint.length <= 12 && /[⌘⇧⌥⌃]|^(Alt|Ctrl|Shift)\+/.test(hint);

/** Groups in the order people look for them; any other group follows. */
const GROUP_ORDER = ["Notes", "View", "Templates", "Sync", "Go to"];

export function ToolsDialog({ commands, onClose }: ToolsDialogProps) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = commands.filter(
      (command) =>
        !needle ||
        `${command.label} ${command.group} ${command.keywords ?? ""} ${command.hint ?? ""}`
          .toLowerCase()
          .includes(needle),
    );
    const byGroup = new Map<string, Command[]>();
    for (const command of matching) {
      byGroup.set(command.group, [...(byGroup.get(command.group) ?? []), command]);
    }
    const rank = (group: string) => {
      const index = GROUP_ORDER.indexOf(group);
      return index === -1 ? GROUP_ORDER.length : index;
    };
    return [...byGroup.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  }, [commands, query]);

  const run = (command: Command) => {
    onClose();
    void command.run();
  };

  return (
    <Dialog
      title="All tools"
      subtitle="Everything the editor can do right now. Shortcuts are shown beside each one."
      onClose={onClose}
      wide
      steady
    >
      <div className="flex flex-col gap-4">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tools…"
          aria-label="Filter tools"
          className="w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[13.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
        />

        {groups.length === 0 && (
          <p className="py-8 text-center text-[13px] text-[var(--fl-muted)]">
            No tool matches “{query.trim()}”.
          </p>
        )}

        {groups.map(([group, list]) => (
          <section key={group} aria-label={group}>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
              {group} <span className="font-normal">· {list.length}</span>
            </h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {list.map((command) => (
                <li key={command.id}>
                  <button
                    type="button"
                    onClick={() => run(command)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-left text-[13px] text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:bg-[var(--fl-elevated)]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span>{command.label}</span>
                      {command.hint && !isShortcut(command.hint) && (
                        <span className="mt-0.5 text-[11.5px] leading-snug text-[var(--fl-muted)]">
                          {command.hint}
                        </span>
                      )}
                    </span>
                    {command.hint && isShortcut(command.hint) && (
                      <kbd className="shrink-0 rounded border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-1.5 py-0.5 font-sans text-[10.5px] text-[var(--fl-muted)]">
                        {command.hint}
                      </kbd>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
