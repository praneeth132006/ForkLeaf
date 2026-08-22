/**
 * Starter diagrams.
 *
 * Mermaid's hardest moment is the blank page: remembering whether it is
 * `graph TD` or `flowchart TD`, what an ERD relationship looks like, which
 * arrow means what. Every template here is a complete, valid diagram the user
 * can insert and then edit, rather than a snippet they still have to assemble.
 */

export type DiagramKind =
  | "flowchart"
  | "sequence"
  | "class"
  | "state"
  | "er"
  | "gantt"
  | "mindmap"
  | "pie"
  | "journey"
  | "timeline"
  | "gitgraph"
  | "quadrant";

export interface DiagramTemplate {
  id: string;
  kind: DiagramKind;
  title: string;
  description: string;
  /** Single emoji shown on the gallery card. */
  icon: string;
  code: string;
}

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    id: "flowchart-basic",
    kind: "flowchart",
    title: "Flowchart",
    description: "Steps and decisions, top to bottom",
    icon: "🔀",
    code: `flowchart TD
    Start([Start]) --> Input[/Collect input/]
    Input --> Check{Valid?}
    Check -->|Yes| Save[(Save to database)]
    Check -->|No| Error[Show error]
    Error --> Input
    Save --> Done([Done])`,
  },
  {
    id: "flowchart-lanes",
    kind: "flowchart",
    title: "Flowchart with groups",
    description: "Steps grouped into labelled phases",
    icon: "🗂️",
    code: `flowchart LR
    subgraph Plan
        A[Idea] --> B[Spec]
    end
    subgraph Build
        B --> C[Implement]
        C --> D[Review]
    end
    subgraph Ship
        D --> E[Deploy]
    end`,
  },
  {
    id: "sequence-basic",
    kind: "sequence",
    title: "Sequence diagram",
    description: "Messages between people or services over time",
    icon: "↔️",
    code: `sequenceDiagram
    autonumber
    actor User
    participant App
    participant API
    participant DB

    User->>App: Click "Save"
    App->>API: PUT /notes/42
    API->>DB: UPDATE notes
    DB-->>API: OK
    API-->>App: 200 OK
    App-->>User: Saved ✓`,
  },
  {
    id: "sequence-auth",
    kind: "sequence",
    title: "Login flow",
    description: "Authentication with a token exchange",
    icon: "🔐",
    code: `sequenceDiagram
    actor User
    participant App
    participant Provider

    User->>App: Sign in
    App->>Provider: Redirect to authorize
    Provider-->>User: Ask for consent
    User->>Provider: Approve
    Provider-->>App: Redirect with code
    App->>Provider: Exchange code for token
    Provider-->>App: Access token
    App-->>User: Signed in`,
  },
  {
    id: "class-basic",
    kind: "class",
    title: "Class diagram",
    description: "Types, fields and how they relate",
    icon: "🧱",
    code: `classDiagram
    class Note {
        +string id
        +string path
        +string content
        +save() void
    }
    class Workspace {
        +string name
        +RepoRef repo
    }
    class RepoRef {
        +string owner
        +string branch
    }

    Workspace "1" --> "*" Note : contains
    Workspace --> RepoRef : points at`,
  },
  {
    id: "state-basic",
    kind: "state",
    title: "State machine",
    description: "States and the events that move between them",
    icon: "🔁",
    code: `stateDiagram-v2
    [*] --> Idle
    Idle --> Editing : user types
    Editing --> Pending : stops typing
    Pending --> Syncing : debounce elapsed
    Syncing --> Idle : success
    Syncing --> Offline : no connection
    Offline --> Syncing : reconnected
    Syncing --> Conflict : remote changed
    Conflict --> Idle : resolved`,
  },
  {
    id: "er-basic",
    kind: "er",
    title: "Entity relationship",
    description: "Database tables and their relationships",
    icon: "🗃️",
    code: `erDiagram
    USER ||--o{ WORKSPACE : owns
    WORKSPACE ||--o{ NOTE : contains
    NOTE }o--o{ TAG : "tagged with"

    USER {
        string login PK
        string email
    }
    NOTE {
        string path PK
        string title
        datetime updated_at
    }`,
  },
  {
    id: "gantt-basic",
    kind: "gantt",
    title: "Gantt chart",
    description: "A schedule with phases and dependencies",
    icon: "📅",
    code: `gantt
    title Project plan
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Research
    Interviews        :done,    a1, 2026-01-05, 10d
    Synthesis         :active,  a2, after a1, 5d

    section Build
    Prototype         :         b1, after a2, 14d
    Testing           :         b2, after b1, 7d

    section Launch
    Release           :milestone, after b2, 0d`,
  },
  {
    id: "mindmap-basic",
    kind: "mindmap",
    title: "Mind map",
    description: "Branching ideas around a central topic",
    icon: "🧠",
    code: `mindmap
  root((My project))
    Research
      Interviews
      Competitors
    Design
      Wireframes
      Design system
    Build
      Frontend
      Backend
    Launch
      Docs
      Announcement`,
  },
  {
    id: "pie-basic",
    kind: "pie",
    title: "Pie chart",
    description: "Proportions of a whole",
    icon: "🥧",
    code: `pie showData
    title Where the time went
    "Writing" : 45
    "Editing" : 25
    "Research" : 20
    "Meetings" : 10`,
  },
  {
    id: "journey-basic",
    kind: "journey",
    title: "User journey",
    description: "Steps a user takes, scored by how it feels",
    icon: "🚶",
    code: `journey
    title Writing a note
    section Start
      Open the app: 5: User
      Find the folder: 3: User
    section Write
      Type the note: 5: User
      Insert a diagram: 4: User
    section Finish
      Autosave to GitHub: 5: User, App`,
  },
  {
    id: "timeline-basic",
    kind: "timeline",
    title: "Timeline",
    description: "Events in chronological order",
    icon: "📜",
    code: `timeline
    title Release history
    2026 Q1 : Prototype
            : First internal build
    2026 Q2 : Public beta
    2026 Q3 : 1.0 release
            : Mobile support`,
  },
  {
    id: "gitgraph-basic",
    kind: "gitgraph",
    title: "Git graph",
    description: "Branches, commits and merges",
    icon: "🌿",
    code: `gitGraph
    commit id: "init"
    branch feature
    checkout feature
    commit id: "add editor"
    commit id: "add sync"
    checkout main
    merge feature
    commit id: "release"`,
  },
  {
    id: "quadrant-basic",
    kind: "quadrant",
    title: "Quadrant chart",
    description: "Compare items on two axes",
    icon: "🎯",
    code: `quadrantChart
    title Effort vs impact
    x-axis Low effort --> High effort
    y-axis Low impact --> High impact
    quadrant-1 Do now
    quadrant-2 Plan carefully
    quadrant-3 Skip
    quadrant-4 Quick wins
    Offline mode: [0.7, 0.9]
    Dark theme: [0.2, 0.5]
    Export to PDF: [0.4, 0.8]
    Custom fonts: [0.3, 0.2]`,
  },
];

export function templatesByKind(kind: DiagramKind): DiagramTemplate[] {
  return DIAGRAM_TEMPLATES.filter((t) => t.kind === kind);
}

export function findTemplate(id: string): DiagramTemplate | undefined {
  return DIAGRAM_TEMPLATES.find((t) => t.id === id);
}

/**
 * Works out which kind of diagram some source is, so the editor can show the
 * right autocomplete list and cheatsheet.
 */
export function detectKind(code: string): DiagramKind | null {
  // Skip directives, comments and blank lines to find the real first token.
  const firstLine = code
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "" && !l.startsWith("%%") && !l.startsWith("---"));

  if (!firstLine) return null;

  const head = firstLine.toLowerCase();
  if (head.startsWith("flowchart") || head.startsWith("graph")) return "flowchart";
  if (head.startsWith("sequencediagram")) return "sequence";
  if (head.startsWith("classdiagram")) return "class";
  if (head.startsWith("statediagram")) return "state";
  if (head.startsWith("erdiagram")) return "er";
  if (head.startsWith("gantt")) return "gantt";
  if (head.startsWith("mindmap")) return "mindmap";
  if (head.startsWith("pie")) return "pie";
  if (head.startsWith("journey")) return "journey";
  if (head.startsWith("timeline")) return "timeline";
  if (head.startsWith("gitgraph")) return "gitgraph";
  if (head.startsWith("quadrantchart")) return "quadrant";
  return null;
}

// ─── Starting from nothing ──────────────────────────────────────────────────

/**
 * What each diagram type is for, in the words somebody choosing would use.
 *
 * The template gallery answers "show me a diagram like the one I want"; this
 * answers the question before it — "what am I drawing?" — which is the one you
 * actually have when you press the diagram button on an empty note.
 */
export interface DiagramType {
  kind: DiagramKind;
  title: string;
  /** What it is good for, not what it is called. */
  description: string;
  /** True when the type can be drawn on the canvas rather than only typed. */
  drawable: boolean;
}

export const DIAGRAM_TYPES: DiagramType[] = [
  {
    kind: "flowchart",
    title: "Flowchart",
    description: "Steps, decisions and where they lead",
    drawable: true,
  },
  {
    kind: "sequence",
    title: "Sequence",
    description: "Messages between people or services, in order",
    drawable: true,
  },
  {
    kind: "class",
    title: "Class diagram",
    description: "Types, their fields, and how they relate",
    drawable: true,
  },
  {
    kind: "state",
    title: "State machine",
    description: "States and the events that move between them",
    drawable: true,
  },
  {
    kind: "er",
    title: "Entity relationship",
    description: "Tables, columns and their keys",
    drawable: true,
  },
  {
    kind: "mindmap",
    title: "Mindmap",
    description: "One idea, branching outwards",
    drawable: true,
  },
  {
    kind: "gantt",
    title: "Gantt chart",
    description: "Tasks along a calendar",
    drawable: false,
  },
  {
    kind: "timeline",
    title: "Timeline",
    description: "Events in the order they happened",
    drawable: false,
  },
  {
    kind: "journey",
    title: "User journey",
    description: "Steps through a task, scored by how they felt",
    drawable: false,
  },
  {
    kind: "pie",
    title: "Pie chart",
    description: "Parts of a whole",
    drawable: false,
  },
  {
    kind: "gitgraph",
    title: "Git graph",
    description: "Branches, commits and merges",
    drawable: false,
  },
  {
    kind: "quadrant",
    title: "Quadrant chart",
    description: "Compare items on two axes",
    drawable: false,
  },
];

/** The diagram types the drag-and-drop canvas can edit. */
export const CANVAS_KINDS: DiagramKind[] = [
  "flowchart",
  "state",
  "class",
  "er",
  "mindmap",
  "sequence",
];

export function isDrawable(kind: DiagramKind | null): boolean {
  return kind !== null && CANVAS_KINDS.includes(kind);
}

/**
 * The least source that is a valid diagram of this kind — a blank canvas.
 *
 * Deliberately not a worked example. Being handed a finished flowchart about
 * somebody else's login flow and told to edit it into your own is more work
 * than starting empty, and it is why the gallery is a separate choice rather
 * than the only one. The chart types that cannot be drawn get a little more,
 * because their first two lines are configuration nobody remembers.
 */
export function blankDiagram(kind: DiagramKind): string {
  switch (kind) {
    case "flowchart":
      return "flowchart TD";
    case "state":
      return "stateDiagram-v2\n    direction TB";
    case "class":
      return "classDiagram\n    direction TB";
    case "er":
      return "erDiagram";
    case "mindmap":
      return "mindmap";
    case "sequence":
      return "sequenceDiagram\n    autonumber";
    case "gantt":
      return "gantt\n    title Untitled plan\n    dateFormat YYYY-MM-DD\n    section Phase one\n";
    case "timeline":
      return "timeline\n    title Untitled timeline\n";
    case "journey":
      return "journey\n    title Untitled journey\n    section Getting started\n";
    case "pie":
      return "pie showData\n    title Untitled chart\n";
    case "gitgraph":
      return "gitGraph\n    commit\n";
    case "quadrant":
      return "quadrantChart\n    title Untitled comparison\n    x-axis Low --> High\n    y-axis Low --> High\n";
    default:
      return "flowchart TD";
  }
}
