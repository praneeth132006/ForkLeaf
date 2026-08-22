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

// Which theme mermaid is currently configured with. Mermaid keeps its config
// as module-level global state, so re-initialising is the only way to change
// it — and a boolean "did we init" flag meant a theme switch was silently
// ignored, leaving diagrams drawn in the previous palette.
let initializedTheme: MermaidTheme | null = null;

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
    // Every label as real SVG <text>, for every diagram type.
    //
    // Mermaid's default is HTML labels wrapped in <foreignObject>, and the
    // sanitiser strips foreignObject — it is the classic vector for smuggling
    // scripted markup into an SVG. The two together drew state, class and ER
    // diagrams as rows of empty boxes: the shapes survived, the words inside
    // them did not. `flowchart.htmlLabels` used to cover only flowcharts;
    // this root-level flag applies to all of them and takes precedence over
    // the per-diagram settings.
    htmlLabels: false,
    themeVariables: {
      background: theme.background,
      primaryColor: theme.primary,
      primaryTextColor: theme.primaryText,
      primaryBorderColor: theme.primaryBorder,
      lineColor: theme.line,
      secondaryColor: theme.secondary,
      tertiaryColor: theme.tertiary,
      fontFamily: theme.fontFamily,
      // Stated rather than derived. Mermaid computes these from the primary
      // colour's luminance when they are absent, which is how node labels ended
      // up the same colour as the nodes they sit inside — invisible text.
      mainBkg: theme.primary,
      nodeBorder: theme.primaryBorder,
      textColor: theme.primaryText,
      nodeTextColor: theme.primaryText,
      titleColor: theme.primaryText,
      labelColor: theme.primaryText,
      secondaryTextColor: theme.primaryText,
      tertiaryTextColor: theme.primaryText,
      clusterBkg: theme.tertiary,
      clusterBorder: theme.primaryBorder,
      edgeLabelBackground: theme.background,

      // Per-diagram palettes. Mermaid keeps a separate set of variables for
      // each diagram type and derives the unset ones from primaryColor's
      // luminance, which lands on its own idea of a readable colour rather
      // than ours. Pinning them keeps a state chart and a flowchart in the
      // same note looking like they belong to the same app.
      stateBkg: theme.primary,
      stateBorder: theme.primaryBorder,
      stateLabelColor: theme.primaryText,
      altBackground: theme.tertiary,
      compositeBackground: theme.tertiary,
      compositeTitleBackground: theme.tertiary,
      compositeBorder: theme.primaryBorder,
      transitionColor: theme.line,
      transitionLabelColor: theme.primaryText,
      specialStateColor: theme.line,
      innerEndBackground: theme.primaryBorder,
      labelBackgroundColor: theme.background,

      classText: theme.primaryText,
      relationColor: theme.line,
      relationLabelColor: theme.primaryText,
      relationLabelBackground: theme.background,

      actorBkg: theme.primary,
      actorBorder: theme.primaryBorder,
      actorTextColor: theme.primaryText,
      actorLineColor: theme.line,
      signalColor: theme.primaryText,
      signalTextColor: theme.primaryText,
      labelBoxBkgColor: theme.primary,
      labelBoxBorderColor: theme.primaryBorder,
      labelTextColor: theme.primaryText,
      loopTextColor: theme.primaryText,
      noteBkgColor: theme.tertiary,
      noteBorderColor: theme.primaryBorder,
      noteTextColor: theme.primaryText,

      attributeBackgroundColorOdd: theme.primary,
      attributeBackgroundColorEven: theme.tertiary,

      pieTitleTextColor: theme.primaryText,
      pieSectionTextColor: theme.primaryText,
      pieLegendTextColor: theme.primaryText,
      pieStrokeColor: theme.primaryBorder,
    },
    flowchart: { htmlLabels: false, curve: "basis" },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });

  initializedTheme = theme;
}

export interface RenderResult {
  /** Sanitised SVG markup, or null when the source failed to parse. */
  svg: string | null;
  error: DiagramError | null;
}

let renderCounter = 0;

/**
 * Rendered diagrams, keyed by source and theme.
 *
 * Rendering is not cheap — mermaid parses, lays out, builds a DOM subtree and
 * measures text, and then DOMPurify walks the whole SVG — and it was being
 * redone for every diagram in a note on every keystroke, because the caller
 * re-extracts the blocks whenever the markdown changes and cannot tell that a
 * diagram three paragraphs away is the one it drew a moment ago. Typing a
 * sentence under a note with five diagrams meant several hundred full renders.
 *
 * The source is the whole input, so the same string always gives the same
 * picture and the cache can never be stale. Bounded by insertion order, oldest
 * evicted first: SVG strings run to tens of kilobytes and an unbounded map
 * would hold every draft of every diagram edited in the session.
 */
const CACHE_LIMIT = 64;
const cache = new Map<string, RenderResult>();

function cacheKey(code: string, theme: MermaidTheme): string {
  // The theme is one of two module constants in practice, but keying on its
  // contents means a caller passing its own palette is still correct.
  return `${theme.background}|${theme.primary}|${theme.line}|${code}`;
}

function remember(key: string, result: RenderResult): RenderResult {
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return result;
}

/**
 * Drops the cache. Only needed if mermaid's global config is changed from
 * outside this module, which would make every cached picture wrong.
 */
export function clearDiagramCache(): void {
  cache.clear();
}

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

  const key = cacheKey(code, theme);
  const cached = cache.get(key);
  if (cached) {
    // Re-inserted so the most recently used entry is the last to be evicted.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  if (initializedTheme !== theme) await initMermaid(theme);

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
    return remember(key, { svg: sanitizeSvg(svg), error: null });
  } catch (err) {
    // Failures are cached too. Mid-keystroke source is invalid far more often
    // than it is valid, and re-parsing the same broken string on every
    // subsequent render is the most repeated work of the lot.
    return remember(key, { svg: null, error: parseMermaidError(err, code) });
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
