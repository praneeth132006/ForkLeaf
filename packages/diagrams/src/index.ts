export {
  DIAGRAM_TEMPLATES,
  DIAGRAM_TYPES,
  CANVAS_KINDS,
  isDrawable,
  blankDiagram,
  templatesByKind,
  findTemplate,
  detectKind,
  type DiagramKind,
  type DiagramTemplate,
  type DiagramType,
} from "./templates";

export {
  graphToMermaid,
  mermaidToGraph,
  addNode,
  updateNode,
  removeNode,
  addEdge,
  updateEdge,
  removeEdge,
  nextNodeId,
  EMPTY_GRAPH,
  SHAPES_FOR_KIND,
  EDGE_STYLES_FOR_KIND,
  DEFAULT_EDGE_STYLE,
  SHAPE_LABELS,
  EDGE_LABELS,
  splitMembers,
  joinMembers,
  type Graph,
  type GraphNode,
  type GraphEdge,
  type GraphKind,
  type NodeShape,
  type EdgeStyle,
  type FlowDirection,
} from "./graph-model";

export {
  initMermaid,
  renderDiagram,
  sanitizeSvg,
  toStandaloneSvg,
  LIGHT_THEME,
  DARK_THEME,
  type MermaidTheme,
  type RenderResult,
} from "./render";

export { parseMermaidError, type DiagramError } from "./errors";

export { completionsFor, cheatsheetFor, expandSnippet, type Completion } from "./completions";
