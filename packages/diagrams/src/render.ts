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
 * How many colours mermaid asks a scale for. Its own limit, not ours.
 */
const BRANCH_SCALE_SLOTS = 12;

/**
 * Ink for a label sitting on one of the branch colours.
 *
 * Both of them are mid-tone, so the same near-black reads on them in either
 * theme — following `primaryText` would put cream lettering on amber in dark
 * mode and lose it.
 */
const BRANCH_INK = "#14181F";

/**
 * How many colours mermaid asks the git scale for. A mindmap's centre is
 * painted from it — `git0` — as well as the branches of a git graph.
 */
const GIT_SCALE_SLOTS = 8;

/** Fills mermaid's colour scales from the two colours we have. */
function branchScale(theme: MermaidTheme): Record<string, string> {
  const colourOf = (slot: number) => (slot % 2 === 0 ? theme.line : theme.secondary);
  const variables: Record<string, string> = {};

  for (let slot = 0; slot < BRANCH_SCALE_SLOTS; slot += 1) {
    variables[`cScale${slot}`] = colourOf(slot);
    variables[`cScaleLabel${slot}`] = BRANCH_INK;
  }

  for (let slot = 0; slot < GIT_SCALE_SLOTS; slot += 1) {
    variables[`git${slot}`] = colourOf(slot);
    variables[`gitBranchLabel${slot}`] = BRANCH_INK;
  }

  return variables;
}

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
    /*
     * The one thing mermaid draws wrong once labels are real SVG text.
     *
     * A mindmap's root is a circle sized to fit its label, and the label is
     * then dropped at the circle's centre — right for an HTML label, which
     * centres itself inside the box it is handed, and wrong for an SVG
     * `<text>`, which *starts* there and runs off to the right of the circle
     * it was measured for. That is why the middle of every mindmap read as a
     * black disc with its title sitting beside it rather than in it.
     */
    themeCSS: ".mindmap-node.section-root text { text-anchor: middle; }",
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

      // Mindmap branches and its centre, and the timeline, journey and git
      // bands that share the same scales.
      //
      // Mermaid derives twelve colours from primaryColor when these are
      // unset, and what it derived here was one amber branch and a ring of
      // boxes the colour of the page behind them — the diagram the reader was
      // meant to take in at a glance was the hardest thing in the note to
      // read. The scale alternates the two colours this app actually has, each
      // with ink dark enough to read on both of them. It has to be colours
      // that show against the background rather than the surface tone, because
      // mermaid paints the branch lines from the same slots.
      ...branchScale(theme),

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
    return remember(key, { svg: fitSvgToContainer(sanitizeSvg(svg)), error: null });
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

/**
 * How far a small diagram is allowed to be blown up past the size mermaid laid
 * it out at, and how far a wide one is allowed to be shrunk before the column
 * gives up and scrolls instead.
 *
 * Mermaid lays every diagram out at a 16px type size, so the scale a picture is
 * drawn at is also the scale its words are read at — which makes mermaid's own
 * size the one that is certainly readable, and these the two directions it can
 * be bent without becoming something else. A two-box diagram stretched the
 * width of a desktop column would be a billboard; a twenty-box flowchart
 * squeezed into a phone would be a grey smudge. Between those, fill the width.
 */
const MAX_UPSCALE = 1.25;
const MIN_DOWNSCALE = 0.6;

/**
 * Makes a rendered diagram take the width it is given.
 *
 * Mermaid hands back `<svg width="100%" style="max-width: 691px">`, which only
 * does the right thing inside a block-level box. Every surface that shows a
 * diagram here centres it — in a flex row, in a `text-align: center` figure —
 * and a percentage width inside a shrink-to-fit box has nothing to be a
 * percentage *of*, so the browser falls back to the 300px default width for a
 * replaced element. That is why a diagram laid out at 1277px was being drawn
 * 300px wide and 31px tall: a row of labelled specks with acres of space
 * around them, in a container sized for the picture that should have been
 * there.
 *
 * Width and height move to the style attribute, where they beat the
 * `max-width: 100%` rules the surfaces apply, and `max-width` becomes a cap on
 * enlargement rather than a refusal to enlarge at all. The floor is a real
 * minimum: a diagram too wide for the column keeps a readable size and the
 * column scrolls, which is what the preview's `overflow-x` was always there
 * for.
 */
export function fitSvgToContainer(svg: string): string {
  const open = /<svg\b[^>]*>/.exec(svg);
  if (!open) return svg;

  const tag = open[0];
  const viewBox = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(tag);
  if (!viewBox) return svg;

  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  if (!(width > 0) || !(height > 0)) return svg;

  // The attributes are dropped rather than rewritten: an SVG carrying both
  // `width="100%"` and a style width is one more place for the two to disagree.
  const attributes = tag
    .slice(4, -1)
    .replace(/\s(?:width|height|style)="[^"]*"/g, "")
    .trim();

  const style = [
    "width: 100%",
    "height: auto",
    `max-width: ${round(width * MAX_UPSCALE)}px`,
    `min-width: ${round(width * MIN_DOWNSCALE)}px`,
  ].join("; ");

  return svg.replace(tag, `<svg ${attributes} style="${style}">`);
}

/** Whole pixels: a style attribute is not the place for fifteen decimals. */
function round(value: number): number {
  return Math.round(value);
}
