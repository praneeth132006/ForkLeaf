import DOMPurify from "dompurify";
import type { DiagramError } from "./errors";
import { parseMermaidError } from "./errors";

/**
 * Mermaid rendering.
 *
 * Two things matter here beyond "make a picture":
 *
 * 1. Security. Mermaid's `securityLevel: "loose"` allows click handlers and raw
 *    HTML in labels, and the rendered SVG is injected with innerHTML. Since a
 *    note can come from any public repository the user opens, that combination
 *    is a stored-XSS hole. We run mermaid in `strict` mode and sanitise the SVG
 *    afterwards regardless.
 *
 * 2. Not losing the last good picture. While the user is mid-keystroke the
 *    source is usually invalid; showing an error and blanking the canvas on
 *    every character is unusable. The renderer returns the error while the
 *    caller keeps displaying the previous SVG.
 */

let initialized = false;

export interface MermaidTheme {
  background: string;
  primary: string;
  primaryText: string;
  primaryBorder: string;
  line: string;
  secondary: string;
  tertiary: string;
  fontFamily: string;
}

export const LIGHT_THEME: MermaidTheme = {
  background: "#F1EEE6",
  primary: "#FFFFFF",
  primaryText: "#22262E",
  primaryBorder: "#2A3240",
  line: "#3FA796",
  secondary: "#E8A33D",
  tertiary: "#EDEAE2",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};

export const DARK_THEME: MermaidTheme = {
  background: "#14181F",
  primary: "#1E2530",
  primaryText: "#EDEAE2",
  primaryBorder: "#3FA796",
  line: "#3FA796",
  secondary: "#E8A33D",
  tertiary: "#22262E",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};

/**
 * Configures mermaid once per page.
 *
 * `startOnLoad` is off because we render explicitly, and `securityLevel` is
 * strict so labels can never carry scripts or click bindings.
 */
export async function initMermaid(theme: MermaidTheme = LIGHT_THEME): Promise<void> {
  const mermaid = (await import("mermaid")).default;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: theme.fontFamily,
    themeVariables: {
      background: theme.background,
      primaryColor: theme.primary,
      primaryTextColor: theme.primaryText,
      primaryBorderColor: theme.primaryBorder,
      lineColor: theme.line,
      secondaryColor: theme.secondary,
      tertiaryColor: theme.tertiary,
      fontFamily: theme.fontFamily,
    },
    flowchart: { htmlLabels: false, curve: "basis" },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });

  initialized = true;
}

export interface RenderResult {
  /** Sanitised SVG markup, or null when the source failed to parse. */
  svg: string | null;
  error: DiagramError | null;
}

let renderCounter = 0;

/**
 * Renders mermaid source to sanitised SVG.
 *
 * Never throws: a syntax error is a normal state while typing, so it comes back
 * as a value the caller can display next to the last good diagram.
 */
export async function renderDiagram(
  code: string,
  theme: MermaidTheme = LIGHT_THEME,
): Promise<RenderResult> {
  if (!code.trim()) return { svg: null, error: null };

  if (!initialized) await initMermaid(theme);

  const mermaid = (await import("mermaid")).default;
  // Mermaid keys internal state by element id; a collision produces a blank or
  // duplicated diagram when two blocks render in the same tick.
  renderCounter += 1;
  const id = `forkleaf-diagram-${renderCounter}`;

  try {
    // parse() gives a clean syntax error without leaving a half-built DOM node
    // behind, which render() does on failure.
    await mermaid.parse(code);
    const { svg } = await mermaid.render(id, code);
    return { svg: sanitizeSvg(svg), error: null };
  } catch (err) {
    return { svg: null, error: parseMermaidError(err, code) };
  } finally {
    // Mermaid appends a temporary measuring node that it does not always clean
    // up; left alone these accumulate on every keystroke.
    if (typeof document !== "undefined") {
      document.getElementById(`d${id}`)?.remove();
    }
  }
}

/**
 * Strips anything executable from mermaid's SVG output.
 *
 * Mermaid is trusted code, but the *labels* inside the SVG come from note
 * content, which is not. This is the last line of defence for a note opened
 * from someone else's repository.
 */
export function sanitizeSvg(svg: string): string {
  if (typeof window === "undefined") return svg;

  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // Belt and braces: the SVG profile already excludes these.
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"],
    FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover", "href", "xlink:href"],
  });
}

/** Wraps SVG markup so it can be downloaded or embedded as a standalone file. */
export function toStandaloneSvg(svg: string): string {
  const withNamespace = svg.includes("xmlns=")
    ? svg
    : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${withNamespace}`;
}
