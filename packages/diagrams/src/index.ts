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
  tidyLayout,
  duplicateNodes,
  moveNodes,
  removeMany,
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
  clearDiagramCache,
  sanitizeSvg,
  toStandaloneSvg,
  LIGHT_THEME,
  DARK_THEME,
  type MermaidTheme,
  type RenderResult,
} from "./render";

export { parseMermaidError, type DiagramError } from "./errors";

export { completionsFor, cheatsheetFor, expandSnippet, type Completion } from "./completions";

export {
  sequenceToMermaid,
  mermaidToSequence,
  addParticipant,
  updateParticipant,
  removeParticipant,
  moveParticipant,
  addMessage,
  updateMessage,
  removeMessage,
  moveMessage,
  nextParticipantId,
  EMPTY_SEQUENCE,
  ARROW_LABELS,
  type SequenceDiagram,
  type SequenceParticipant,
  type SequenceMessage,
  type MessageArrow,
} from "./sequence-model";

export {
  sizeOf,
  hasMembers,
  isMarker,
  clamp,
  textWidth,
  NODE_WIDTH,
  NODE_HEIGHT,
  MEMBER_HEADER,
  MEMBER_HEIGHT,
  LABEL_CHAR_WIDTH,
  LABEL_PADDING,
  type Size,
} from "./geometry";

export {
  diffDiagrams,
  diffGraphs,
  diffSequences,
  pairDiagrams,
  summarizeDiff,
  type DiagramDiff,
  type DiagramPair,
  type DiffCounts,
  type DiffStatus,
  type EdgeDiff,
  type FieldChange,
  type GraphDiff,
  type GraphDiffOptions,
  type MessageDiff,
  type NodeDiff,
  type OpaqueDiff,
  type SequenceDiff,
} from "./diff";

export {
  graphToSvg,
  mermaidToSvg,
  diffToSvg,
  isDrawableDiff,
  escapeXml,
  LIGHT_SVG_THEME,
  DARK_SVG_THEME,
  type RenderSvgOptions,
  type SvgTheme,
} from "./svg";

export { lintDiagram, lintGraph, lintSequence, type LintFinding, type LintSeverity } from "./lint";

export {
  diagramNodes,
  indexDiagrams,
  normalizeAnchor,
  resolveDiagramAnchor,
  searchDiagramNodes,
  type DiagramIndexEntry,
  type DiagramNodeRef,
  type DiagramSearchHit,
} from "./search";

export {
  importDiagram,
  composeToDiagram,
  gitLogToDiagram,
  sqlToDiagram,
  stackTraceToDiagram,
  type DiagramImport,
  type ImportKind,
} from "./import";

export {
  extractDiagramLinks,
  hasDiagramLinks,
  markLinkedNodes,
  normalizeLabel,
  type DiagramLink,
  type LinkedDiagram,
} from "./links";
