import type { DiagramKind } from "./templates";

/**
 * Autocomplete and reference data for the mermaid source editor.
 *
 * Mermaid's syntax is small but almost impossible to recall exactly — is it
 * `-->|label|` or `-- label -->`? does an ERD use `||--o{` or `1--*`? This
 * table is what turns "look it up in the docs" into "press ctrl-space".
 *
 * Each entry carries a snippet with `${}` placeholders so the editor can drop
 * in working syntax rather than a bare keyword.
 */

export interface Completion {
  /** Text shown in the completion list. */
  label: string;
  /** What gets inserted. `${n:placeholder}` marks a tab stop. */
  snippet: string;
  detail: string;
  /** Grouping for the cheatsheet panel. */
  section: string;
}

const FLOWCHART: Completion[] = [
  {
    label: "flowchart TD",
    snippet: "flowchart TD",
    detail: "Top-down flowchart",
    section: "Start",
  },
  {
    label: "flowchart LR",
    snippet: "flowchart LR",
    detail: "Left-to-right flowchart",
    section: "Start",
  },
  {
    label: "node (process)",
    snippet: "${1:id}[${2:Label}]",
    detail: "A[Label] — rectangle",
    section: "Nodes",
  },
  {
    label: "node (rounded)",
    snippet: "${1:id}(${2:Label})",
    detail: "A(Label) — rounded box",
    section: "Nodes",
  },
  {
    label: "node (start/end)",
    snippet: "${1:id}([${2:Label}])",
    detail: "A([Label]) — stadium",
    section: "Nodes",
  },
  {
    label: "node (decision)",
    snippet: "${1:id}{${2:Label}}",
    detail: "A{Label} — diamond",
    section: "Nodes",
  },
  {
    label: "node (database)",
    snippet: "${1:id}[(${2:Label})]",
    detail: "A[(Label)] — cylinder",
    section: "Nodes",
  },
  {
    label: "node (circle)",
    snippet: "${1:id}((${2:Label}))",
    detail: "A((Label)) — circle",
    section: "Nodes",
  },
  {
    label: "node (input/output)",
    snippet: "${1:id}[/${2:Label}/]",
    detail: "A[/Label/] — parallelogram",
    section: "Nodes",
  },
  {
    label: "node (hexagon)",
    snippet: "${1:id}{{${2:Label}}}",
    detail: "A{{Label}} — hexagon",
    section: "Nodes",
  },
  { label: "arrow", snippet: "${1:A} --> ${2:B}", detail: "A --> B", section: "Links" },
  {
    label: "arrow with label",
    snippet: "${1:A} -->|${2:label}| ${3:B}",
    detail: "A -->|yes| B",
    section: "Links",
  },
  {
    label: "open link",
    snippet: "${1:A} --- ${2:B}",
    detail: "A --- B — no arrowhead",
    section: "Links",
  },
  { label: "dotted arrow", snippet: "${1:A} -.-> ${2:B}", detail: "A -.-> B", section: "Links" },
  { label: "thick arrow", snippet: "${1:A} ==> ${2:B}", detail: "A ==> B", section: "Links" },
  { label: "bidirectional", snippet: "${1:A} <--> ${2:B}", detail: "A <--> B", section: "Links" },
  {
    label: "subgraph",
    snippet: "subgraph ${1:Name}\n    ${2:A --> B}\nend",
    detail: "Group nodes together",
    section: "Structure",
  },
  {
    label: "style a node",
    snippet: "style ${1:A} fill:${2:#E8A33D},stroke:#2A3240",
    detail: "Colour one node",
    section: "Styling",
  },
  {
    label: "classDef",
    snippet: "classDef ${1:name} fill:${2:#E8A33D},stroke:#2A3240\nclass ${3:A} ${1:name}",
    detail: "Reusable node style",
    section: "Styling",
  },
  { label: "comment", snippet: "%% ${1:note}", detail: "Not rendered", section: "Structure" },
];

const SEQUENCE: Completion[] = [
  {
    label: "sequenceDiagram",
    snippet: "sequenceDiagram",
    detail: "Start a sequence diagram",
    section: "Start",
  },
  { label: "autonumber", snippet: "autonumber", detail: "Number every message", section: "Start" },
  {
    label: "participant",
    snippet: "participant ${1:Name}",
    detail: "Declare a participant",
    section: "Participants",
  },
  {
    label: "actor",
    snippet: "actor ${1:Name}",
    detail: "Participant drawn as a person",
    section: "Participants",
  },
  {
    label: "participant as",
    snippet: "participant ${1:A} as ${2:Display name}",
    detail: "Short id, long label",
    section: "Participants",
  },
  {
    label: "message",
    snippet: "${1:A}->>${2:B}: ${3:message}",
    detail: "A->>B: solid arrow",
    section: "Messages",
  },
  {
    label: "reply",
    snippet: "${1:B}-->>${2:A}: ${3:response}",
    detail: "B-->>A: dashed reply",
    section: "Messages",
  },
  {
    label: "message (no arrowhead)",
    snippet: "${1:A}->${2:B}: ${3:message}",
    detail: "A->B",
    section: "Messages",
  },
  {
    label: "self message",
    snippet: "${1:A}->>${1:A}: ${2:think}",
    detail: "Loop back to itself",
    section: "Messages",
  },
  {
    label: "activate",
    snippet: "activate ${1:A}",
    detail: "Start an activation bar",
    section: "Lifelines",
  },
  {
    label: "deactivate",
    snippet: "deactivate ${1:A}",
    detail: "End an activation bar",
    section: "Lifelines",
  },
  {
    label: "loop",
    snippet: "loop ${1:every minute}\n    ${2:A->>B: poll}\nend",
    detail: "Repeat a block",
    section: "Blocks",
  },
  {
    label: "alt / else",
    snippet: "alt ${1:success}\n    ${2:A->>B: ok}\nelse ${3:failure}\n    ${4:A->>B: error}\nend",
    detail: "Branching",
    section: "Blocks",
  },
  {
    label: "opt",
    snippet: "opt ${1:if logged in}\n    ${2:A->>B: fetch}\nend",
    detail: "Optional block",
    section: "Blocks",
  },
  {
    label: "par",
    snippet: "par ${1:first}\n    ${2:A->>B: one}\nand ${3:second}\n    ${4:A->>C: two}\nend",
    detail: "Parallel actions",
    section: "Blocks",
  },
  {
    label: "note",
    snippet: "Note over ${1:A},${2:B}: ${3:text}",
    detail: "Note over participants",
    section: "Annotations",
  },
  {
    label: "note right",
    snippet: "Note right of ${1:A}: ${2:text}",
    detail: "Note beside one participant",
    section: "Annotations",
  },
];

const CLASS: Completion[] = [
  {
    label: "classDiagram",
    snippet: "classDiagram",
    detail: "Start a class diagram",
    section: "Start",
  },
  {
    label: "class",
    snippet: "class ${1:Name} {\n    +${2:string field}\n    +${3:method()} ${4:void}\n}",
    detail: "Define a class",
    section: "Classes",
  },
  {
    label: "inheritance",
    snippet: "${1:Parent} <|-- ${2:Child}",
    detail: "Child extends Parent",
    section: "Relations",
  },
  {
    label: "composition",
    snippet: "${1:Whole} *-- ${2:Part}",
    detail: "Part cannot exist alone",
    section: "Relations",
  },
  {
    label: "aggregation",
    snippet: "${1:Whole} o-- ${2:Part}",
    detail: "Part can exist alone",
    section: "Relations",
  },
  {
    label: "association",
    snippet: "${1:A} --> ${2:B} : ${3:label}",
    detail: "Directed association",
    section: "Relations",
  },
  {
    label: "cardinality",
    snippet: '${1:A} "1" --> "*" ${2:B} : ${3:has}',
    detail: "One-to-many",
    section: "Relations",
  },
  {
    label: "interface",
    snippet: "class ${1:Name} {\n    <<interface>>\n    +${2:method()}\n}",
    detail: "Stereotype",
    section: "Classes",
  },
];

const STATE: Completion[] = [
  {
    label: "stateDiagram-v2",
    snippet: "stateDiagram-v2",
    detail: "Start a state diagram",
    section: "Start",
  },
  {
    label: "initial state",
    snippet: "[*] --> ${1:Idle}",
    detail: "Entry point",
    section: "States",
  },
  { label: "final state", snippet: "${1:Done} --> [*]", detail: "Exit point", section: "States" },
  {
    label: "transition",
    snippet: "${1:A} --> ${2:B} : ${3:event}",
    detail: "Move between states",
    section: "States",
  },
  {
    label: "composite state",
    snippet: "state ${1:Name} {\n    [*] --> ${2:Sub}\n}",
    detail: "Nested states",
    section: "Structure",
  },
  {
    label: "choice",
    snippet: "state ${1:choice} <<choice>>",
    detail: "Branch point",
    section: "Structure",
  },
  {
    label: "note",
    snippet: "note right of ${1:State} : ${2:text}",
    detail: "Annotate a state",
    section: "Annotations",
  },
];

const ER: Completion[] = [
  { label: "erDiagram", snippet: "erDiagram", detail: "Start an ER diagram", section: "Start" },
  {
    label: "one to many",
    snippet: "${1:A} ||--o{ ${2:B} : ${3:has}",
    detail: "Exactly one to zero or more",
    section: "Relations",
  },
  {
    label: "one to one",
    snippet: "${1:A} ||--|| ${2:B} : ${3:has}",
    detail: "Exactly one to exactly one",
    section: "Relations",
  },
  {
    label: "many to many",
    snippet: "${1:A} }o--o{ ${2:B} : ${3:relates to}",
    detail: "Zero or more both ways",
    section: "Relations",
  },
  {
    label: "one to at least one",
    snippet: "${1:A} ||--|{ ${2:B} : ${3:has}",
    detail: "Exactly one to one or more",
    section: "Relations",
  },
  {
    label: "attributes",
    snippet: "${1:TABLE} {\n    string ${2:name} PK\n    int ${3:count}\n}",
    detail: "Columns for a table",
    section: "Attributes",
  },
];

const GANTT: Completion[] = [
  {
    label: "gantt",
    snippet: "gantt\n    title ${1:Plan}\n    dateFormat YYYY-MM-DD",
    detail: "Start a gantt chart",
    section: "Start",
  },
  {
    label: "section",
    snippet: "section ${1:Phase}",
    detail: "Group of tasks",
    section: "Structure",
  },
  {
    label: "task",
    snippet: "${1:Task name} : ${2:id}, ${3:2026-01-01}, ${4:5d}",
    detail: "Fixed start and duration",
    section: "Tasks",
  },
  {
    label: "task after",
    snippet: "${1:Task name} : ${2:id}, after ${3:other}, ${4:5d}",
    detail: "Depends on another task",
    section: "Tasks",
  },
  {
    label: "done task",
    snippet: "${1:Task name} :done, ${2:id}, ${3:2026-01-01}, ${4:5d}",
    detail: "Completed",
    section: "Tasks",
  },
  {
    label: "active task",
    snippet: "${1:Task name} :active, ${2:id}, ${3:2026-01-01}, ${4:5d}",
    detail: "In progress",
    section: "Tasks",
  },
  {
    label: "critical task",
    snippet: "${1:Task name} :crit, ${2:id}, ${3:2026-01-01}, ${4:5d}",
    detail: "On the critical path",
    section: "Tasks",
  },
  {
    label: "milestone",
    snippet: "${1:Name} :milestone, ${2:2026-01-01}, 0d",
    detail: "Zero-length marker",
    section: "Tasks",
  },
];

const MINDMAP: Completion[] = [
  {
    label: "mindmap",
    snippet: "mindmap\n  root((${1:Topic}))",
    detail: "Start a mind map",
    section: "Start",
  },
  {
    label: "branch",
    snippet: "    ${1:Branch}",
    detail: "Indent to nest — two spaces per level",
    section: "Structure",
  },
  {
    label: "square node",
    snippet: "    ${1:Name}[${2:Label}]",
    detail: "Square branch",
    section: "Shapes",
  },
  {
    label: "circle node",
    snippet: "    ${1:Name}((${2:Label}))",
    detail: "Circular branch",
    section: "Shapes",
  },
  {
    label: "cloud node",
    snippet: "    ${1:Name})${2:Label}(",
    detail: "Cloud branch",
    section: "Shapes",
  },
  {
    label: "icon",
    snippet: "    ::icon(${1:fa fa-book})",
    detail: "Font Awesome icon",
    section: "Shapes",
  },
];

const PIE: Completion[] = [
  {
    label: "pie",
    snippet: 'pie showData\n    title ${1:Title}\n    "${2:Slice}" : ${3:40}',
    detail: "Start a pie chart",
    section: "Start",
  },
  { label: "slice", snippet: '"${1:Label}" : ${2:25}', detail: "One slice", section: "Data" },
];

const GENERIC: Completion[] = [
  {
    label: "flowchart",
    snippet: "flowchart TD\n    ${1:A[Start]} --> ${2:B[End]}",
    detail: "Steps and decisions",
    section: "Diagram types",
  },
  {
    label: "sequenceDiagram",
    snippet: "sequenceDiagram\n    ${1:A}->>${2:B}: ${3:message}",
    detail: "Messages over time",
    section: "Diagram types",
  },
  {
    label: "classDiagram",
    snippet: "classDiagram\n    class ${1:Name}",
    detail: "Types and relationships",
    section: "Diagram types",
  },
  {
    label: "stateDiagram-v2",
    snippet: "stateDiagram-v2\n    [*] --> ${1:State}",
    detail: "States and transitions",
    section: "Diagram types",
  },
  {
    label: "erDiagram",
    snippet: "erDiagram\n    ${1:A} ||--o{ ${2:B} : ${3:has}",
    detail: "Database entities",
    section: "Diagram types",
  },
  {
    label: "gantt",
    snippet: "gantt\n    title ${1:Plan}\n    dateFormat YYYY-MM-DD",
    detail: "A schedule",
    section: "Diagram types",
  },
  {
    label: "mindmap",
    snippet: "mindmap\n  root((${1:Topic}))",
    detail: "Branching ideas",
    section: "Diagram types",
  },
  {
    label: "pie",
    snippet: 'pie\n    title ${1:Title}\n    "${2:A}" : ${3:50}',
    detail: "Proportions",
    section: "Diagram types",
  },
  {
    label: "timeline",
    snippet: "timeline\n    title ${1:Title}\n    ${2:2026} : ${3:Event}",
    detail: "Chronological events",
    section: "Diagram types",
  },
  {
    label: "journey",
    snippet: "journey\n    title ${1:Title}\n    section ${2:Phase}\n      ${3:Step}: 5: ${4:User}",
    detail: "User journey",
    section: "Diagram types",
  },
  {
    label: "gitGraph",
    snippet: 'gitGraph\n    commit id: "${1:init}"',
    detail: "Branches and merges",
    section: "Diagram types",
  },
  {
    label: "quadrantChart",
    snippet:
      "quadrantChart\n    title ${1:Title}\n    x-axis ${2:Low} --> ${3:High}\n    y-axis ${4:Low} --> ${5:High}",
    detail: "Two-axis comparison",
    section: "Diagram types",
  },
];

const BY_KIND: Record<DiagramKind, Completion[]> = {
  flowchart: FLOWCHART,
  sequence: SEQUENCE,
  class: CLASS,
  state: STATE,
  er: ER,
  gantt: GANTT,
  mindmap: MINDMAP,
  pie: PIE,
  journey: GENERIC,
  timeline: GENERIC,
  gitgraph: GENERIC,
  quadrant: GENERIC,
};

/**
 * Completions for the diagram type currently being written.
 * With no type yet detected, offers the diagram types themselves — which is
 * exactly what an empty block needs.
 */
export function completionsFor(kind: DiagramKind | null): Completion[] {
  return kind ? (BY_KIND[kind] ?? GENERIC) : GENERIC;
}

/** Completions grouped into sections, for the cheatsheet panel. */
export function cheatsheetFor(
  kind: DiagramKind | null,
): { section: string; items: Completion[] }[] {
  const sections = new Map<string, Completion[]>();

  for (const item of completionsFor(kind)) {
    const bucket = sections.get(item.section);
    if (bucket) bucket.push(item);
    else sections.set(item.section, [item]);
  }

  return [...sections].map(([section, items]) => ({ section, items }));
}

/**
 * Strips `${1:placeholder}` markers, returning plain text and the offset where
 * the cursor should land. Editors without snippet support use this.
 */
export function expandSnippet(snippet: string): { text: string; cursor: number } {
  let cursor = -1;
  let text = "";
  let index = 0;

  const pattern = /\$\{(\d+):([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(snippet)) !== null) {
    text += snippet.slice(index, match.index);
    if (cursor === -1) cursor = text.length;
    text += match[2] ?? "";
    index = match.index + match[0].length;
  }

  text += snippet.slice(index);
  return { text, cursor: cursor === -1 ? text.length : cursor };
}
