import type React from "react";
import type { InsertAction } from "./EditorToolbar";
import { insertDefinitionsFor, type InsertDefinition, type InsertSurface } from "./insert-actions";

/**
 * Everything the `/` menu offers, in groups.
 *
 * The menu used to be one long list of blocks, and the app's own features —
 * flashcards, voice notes, the graph — were not in it at all, so the one place
 * people look for "what can I do here" answered with half the answer. It now
 * holds the editor's blocks and the app's tools together, under headings, and
 * a search across all of them.
 *
 * Blocks keep their definitions in `insert-actions`; tools come from the app as
 * `InsertAction`s. This file only decides which group each sits in, the order
 * the groups come in, and how a query ranks them.
 */

const BLOCK_GROUP: Record<string, string> = {
  h1: "Text",
  h2: "Text",
  h3: "Text",
  paragraph: "Text",
  quote: "Text",
  bullet: "Lists",
  ordered: "Lists",
  task: "Lists",
  table: "Insert",
  divider: "Insert",
  image: "Insert",
  youtube: "Insert",
  link: "Insert",
  code: "Insert",
  diagram: "Insert",
  bold: "Formatting",
  italic: "Formatting",
  strike: "Formatting",
  "inline-code": "Formatting",
  break: "Formatting",
  h4: "Formatting",
  h5: "Formatting",
  h6: "Formatting",
  footnote: "Advanced",
  frontmatter: "Advanced",
};

/** The editor's everyday groups come first, the app's tools next, fine print last. */
const LEADING = ["Text", "Lists", "Insert"];
const TRAILING = ["Formatting", "Advanced"];

/** Where an app tool that names no group is listed. */
export const APP_GROUP = "ForkLeaf";

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  group: string;
  keywords: readonly string[];
  target: { kind: "block"; definition: InsertDefinition } | { kind: "app"; action: InsertAction };
}

/** Every item a surface can offer, in display order. */
export function slashItems(
  surface: InsertSurface,
  extras: readonly InsertAction[] = [],
): SlashItem[] {
  const blocks: SlashItem[] = insertDefinitionsFor(surface).map((definition) => ({
    id: definition.id,
    label: definition.label,
    hint: definition.hint,
    icon: definition.icon,
    group: BLOCK_GROUP[definition.id] ?? "Insert",
    keywords: definition.keywords ?? [],
    target: { kind: "block", definition },
  }));
  const tools: SlashItem[] = extras.map((action) => ({
    id: action.id,
    label: action.label,
    hint: action.hint,
    icon: action.icon,
    group: action.group ?? APP_GROUP,
    keywords: action.keywords ?? [],
    target: { kind: "app", action },
  }));

  const toolGroups = [...new Set(tools.map((item) => item.group))].filter(
    (group) => !LEADING.includes(group) && !TRAILING.includes(group),
  );
  const all = [...blocks, ...tools];
  return [...LEADING, ...toolGroups, ...TRAILING].flatMap((group) =>
    all.filter((item) => item.group === group),
  );
}

/**
 * How well one item answers a query. Higher is better; null is no match.
 *
 * Ids count as much as labels because they are what people type — `/h1`,
 * `/table` — and an app tool's `tool:` prefix is ignored, so `/flash` finds
 * `tool:flashcards`. A group name matches too, so `/study` lists that group.
 */
function scoreSlashItem(item: SlashItem, needle: string): number | null {
  const id = item.id.replace(/^[a-z]+:/, "").toLowerCase();
  const label = item.label.toLowerCase();
  const keywords = item.keywords.map((keyword) => keyword.toLowerCase());

  if (id === needle) return 100;
  if (label === needle) return 95;
  if (id.startsWith(needle)) return 80;
  if (label.startsWith(needle)) return 70;
  if (label.split(/\s+/).some((word) => word.startsWith(needle))) return 60;
  if (keywords.some((keyword) => keyword === needle)) return 55;
  if (keywords.some((keyword) => keyword.startsWith(needle))) return 45;
  if (label.includes(needle)) return 30;
  if (item.group.toLowerCase().startsWith(needle)) return 25;
  if (keywords.some((keyword) => keyword.includes(needle))) return 20;
  if (id.includes(needle)) return 15;
  return null;
}

/** The items matching a query, best first; everything, grouped, for no query. */
export function filterSlashItems(
  query: string,
  surface: InsertSurface,
  extras: readonly InsertAction[] = [],
): SlashItem[] {
  const items = slashItems(surface, extras);
  const needle = query.trim().toLowerCase();
  if (!needle) return items;

  return items
    .map((item, index) => ({ item, index, score: scoreSlashItem(item, needle) }))
    .filter(
      (entry): entry is { item: SlashItem; index: number; score: number } => entry.score !== null,
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

/** Consecutive items of the same group, for a menu that shows headings. */
export function groupSlashItems(
  items: readonly SlashItem[],
): { group: string; items: SlashItem[] }[] {
  const groups: { group: string; items: SlashItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

/** The text an app tool types in, when it is text rather than a dialog. */
export function insertTextOf(action: InsertAction): string | null {
  if (action.insert === undefined) return null;
  return typeof action.insert === "function" ? action.insert() : action.insert;
}
