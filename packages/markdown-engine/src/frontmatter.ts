import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { NoteFrontmatter } from "@forkleaf/types";

/**
 * Frontmatter handling.
 *
 * We parse the `---` block by hand rather than using gray-matter: gray-matter
 * pulls in Node `Buffer` and a much larger YAML stack, and this editor runs the
 * parser in the browser on every keystroke.
 */

export interface ParsedDocument {
  frontmatter: NoteFrontmatter;
  /** The markdown body with the frontmatter block removed. */
  content: string;
  /** True when the source actually had a frontmatter block. */
  hadFrontmatter: boolean;
}

/** Matches a leading `---` fence, allowing an optional BOM and CRLF line endings. */
const FRONTMATTER_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Splits a raw markdown file into its frontmatter and body.
 *
 * Malformed YAML is never fatal: we keep the raw text as the body so the user
 * can see and repair it rather than silently losing their note.
 */
export function parseDocument(raw: string): ParsedDocument {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return { frontmatter: {}, content: raw, hadFrontmatter: false };
  }

  const body = raw.slice(match[0].length);
  const yamlSource = match[1] ?? "";

  try {
    const data = parseYaml(yamlSource);
    // A YAML document can legally be a scalar or a list; we only accept a map.
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { frontmatter: {}, content: body, hadFrontmatter: true };
    }
    return { frontmatter: data as NoteFrontmatter, content: body, hadFrontmatter: true };
  } catch {
    // Broken YAML: treat the whole file as body so nothing is destroyed.
    return { frontmatter: {}, content: raw, hadFrontmatter: false };
  }
}

/**
 * Recombines a body and frontmatter into a raw markdown file.
 * An empty frontmatter object produces no `---` block at all.
 */
export function serializeDocument(content: string, frontmatter: NoteFrontmatter): string {
  const entries = Object.entries(frontmatter).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return content;

  const clean = Object.fromEntries(entries);
  const yaml = stringifyYaml(clean, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${content.replace(/^\n+/, "")}`;
}

/**
 * Merges updates into existing frontmatter, dropping keys set to `undefined`
 * so the properties panel can remove a field.
 */
export function updateFrontmatter(
  current: NoteFrontmatter,
  updates: NoteFrontmatter,
): NoteFrontmatter {
  const merged: NoteFrontmatter = { ...current, ...updates };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete merged[key];
  }
  return merged;
}
