export {
  DIAGRAM_TEMPLATES,
  templatesByKind,
  findTemplate,
  detectKind,
  type DiagramKind,
  type DiagramTemplate,
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
  SHAPE_LABELS,
  EDGE_LABELS,
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
