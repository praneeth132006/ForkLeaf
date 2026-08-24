/**
 * Turning something you already have into a first draft of a diagram.
 *
 * The hardest part of mermaid is the first line. The template gallery and the
 * type picker help with that, but they still start from an example rather than
 * from your system — you get a diagram of three boxes called A, B and C and
 * then retype everything.
 *
 * These four cases skip that entirely. A stack trace, a compose file, a schema
 * and a git log are all *already* descriptions of a structure; they just are
 * not drawn. Parsing them is deterministic — no model call, no network, no
 * latency, no cost, and it works offline, which for a local-first app is the
 * difference between a feature and a feature that is sometimes there.
 *
 * Every parser is deliberately shy. It recognises its format or it declines,
 * and declining is cheap because the caller tries all of them and takes the
 * one that matched. A parser that guesses would turn a paste of ordinary prose
 * into a nonsense diagram, which is worse than pasting the prose.
 */

export type ImportKind = "stack-trace" | "compose" | "sql" | "git-log";

export interface DiagramImport {
  kind: ImportKind;
  /** What was recognised, for the "we made this from your …" line. */
  title: string;
  /** Mermaid source, ready to drop into a fence. */
  code: string;
  /** How many things were found — frames, services, tables, commits. */
  count: number;
}

/** A mermaid id that cannot collide with syntax, derived from a name. */
function idFor(name: string, taken: Map<string, string>): string {
  const existing = taken.get(name);
  if (existing) return existing;

  const base = name.replace(/[^A-Za-z0-9]/g, "_").replace(/^(\d)/, "n$1") || "n";
  let id = base;
  let suffix = 2;
  const used = new Set(taken.values());
  while (used.has(id)) id = `${base}_${suffix++}`;

  taken.set(name, id);
  return id;
}

/** Escapes a label for inside `["…"]`, where quotes would end it. */
function label(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

// ─── Stack traces ───────────────────────────────────────────────────────────

/**
 * Frame patterns for the runtimes people actually paste.
 *
 * Each capture gives a function name and, where the format has one, the file
 * it is in. Anything else on the line is ignored, because a stack trace is
 * full of absolute paths and line numbers that make a diagram unreadable.
 */
const FRAME_PATTERNS: { runtime: string; pattern: RegExp; fn: number; file?: number }[] = [
  // Node / V8:  at Object.handler (/app/src/index.js:12:5)
  {
    runtime: "JavaScript",
    pattern: /^\s*at\s+([\w$.<>\s[\]]+?)\s+\((.+?):\d+:\d+\)\s*$/,
    fn: 1,
    file: 2,
  },
  // Node / V8, anonymous:  at /app/src/index.js:12:5
  { runtime: "JavaScript", pattern: /^\s*at\s+(.+?):\d+:\d+\s*$/, fn: 1 },
  // Python:  File "/app/main.py", line 12, in handler
  {
    runtime: "Python",
    pattern: /^\s*File\s+"(.+?)",\s+line\s+\d+,\s+in\s+(\S+)\s*$/,
    fn: 2,
    file: 1,
  },
  // Java:  at com.example.Service.handle(Service.java:12)
  { runtime: "Java", pattern: /^\s*at\s+([\w$.]+)\((.+?):\d+\)\s*$/, fn: 1, file: 2 },
  // Go:  main.handler(0x0, 0x0)
  { runtime: "Go", pattern: /^([\w./()*]+\.[\w()*]+)\(.*\)\s*$/, fn: 1 },
];

interface Frame {
  fn: string;
  file?: string;
  runtime: string;
}

function parseFrames(text: string): Frame[] {
  const frames: Frame[] = [];

  for (const line of text.split("\n")) {
    for (const { runtime, pattern, fn, file } of FRAME_PATTERNS) {
      const match = pattern.exec(line);
      if (!match) continue;

      const name = match[fn]?.trim();
      if (!name) break;

      frames.push({
        fn: name.replace(/^Object\./, ""),
        file: file === undefined ? undefined : basenameOf(match[file] ?? ""),
        runtime,
      });
      break;
    }
  }

  return frames;
}

function basenameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * A stack trace as a sequence diagram of the call path.
 *
 * Reversed, because a trace is printed innermost-first and a sequence diagram
 * reads top-down in the order things happened. The frame that threw is marked
 * with a cross — the one arrow in the notation that means "this is where it
 * went wrong", which is the only reason anyone is reading the trace.
 */
export function stackTraceToDiagram(text: string): DiagramImport | null {
  const frames = parseFrames(text);
  if (frames.length < 2) return null;

  const order = [...frames].reverse();
  const taken = new Map<string, string>();

  const participants: string[] = [];
  const seen = new Set<string>();

  const nameFor = (frame: Frame) => frame.file ?? frame.fn;

  for (const frame of order) {
    const id = idFor(nameFor(frame), taken);
    if (!seen.has(id)) {
      seen.add(id);
      participants.push(`    participant ${id} as ${label(nameFor(frame))}`);
    }
  }

  const messages: string[] = [];
  for (let index = 0; index < order.length - 1; index += 1) {
    const from = idFor(nameFor(order[index]!), taken);
    const to = idFor(nameFor(order[index + 1]!), taken);
    const last = index === order.length - 2;
    // A frame calling into itself is real and common (recursion), and mermaid
    // draws it as a self-message, which is exactly right.
    messages.push(`    ${from}${last ? "-x" : "->>"}${to}: ${label(order[index + 1]!.fn)}`);
  }

  const runtime = frames[0]!.runtime;

  return {
    kind: "stack-trace",
    title: `${runtime} stack trace`,
    count: frames.length,
    code: ["sequenceDiagram", "    autonumber", ...participants, ...messages, ""].join("\n"),
  };
}

// ─── docker-compose ─────────────────────────────────────────────────────────

/**
 * A minimal YAML reader for the shape compose files actually have.
 *
 * Not a YAML parser, and not pretending to be one: it reads two levels of
 * two-space-indented mapping plus list items, which is what `services:` looks
 * like in every compose file anyone has written. Pulling in a YAML library to
 * find `depends_on` would add a dependency to a package that currently has
 * three, for one feature that can decline when it does not understand.
 */
function parseComposeServices(text: string): Map<string, { dependsOn: string[]; image?: string }> {
  const services = new Map<string, { dependsOn: string[]; image?: string }>();

  const lines = text.split("\n").filter((line) => !/^\s*#/.test(line) && line.trim() !== "");

  const servicesAt = lines.findIndex((line) => /^services:\s*$/.test(line));
  if (servicesAt === -1) return services;

  let current: string | null = null;
  let inDependsOn = false;
  let dependsIndent = 0;

  for (const line of lines.slice(servicesAt + 1)) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Back at the top level: another section, so services are done.
    if (indent === 0) break;

    // `  name:` — a service.
    const service = /^([A-Za-z0-9._-]+):\s*$/.exec(trimmed);
    if (indent <= 2 && service) {
      current = service[1]!;
      services.set(current, { dependsOn: [] });
      inDependsOn = false;
      continue;
    }

    if (!current) continue;
    const entry = services.get(current)!;

    if (inDependsOn) {
      // Either `- name` (list form) or `  name:` (condition form).
      const item = /^-\s*([A-Za-z0-9._-]+)\s*$/.exec(trimmed);
      const keyed = /^([A-Za-z0-9._-]+):\s*$/.exec(trimmed);

      if (item) {
        entry.dependsOn.push(item[1]!);
        continue;
      }
      if (keyed && indent > dependsIndent) {
        entry.dependsOn.push(keyed[1]!);
        continue;
      }
      // A `condition:` line under one of those names is still inside the
      // block; only an outdent means the block has ended.
      if (indent > dependsIndent) continue;
      inDependsOn = false;
    }

    if (/^depends_on:\s*$/.test(trimmed)) {
      inDependsOn = true;
      dependsIndent = indent;
      continue;
    }

    const inline = /^depends_on:\s*\[(.+)\]\s*$/.exec(trimmed);
    if (inline) {
      entry.dependsOn.push(
        ...inline[1]!
          .split(",")
          .map((name) => name.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean),
      );
      continue;
    }

    const image = /^image:\s*(.+?)\s*$/.exec(trimmed);
    if (image) entry.image = image[1]!.replace(/^["']|["']$/g, "");
  }

  return services;
}

/**
 * Compose services as a flowchart of what waits for what.
 *
 * Only real `depends_on` edges, never inferred ones. A service graph that
 * invents a dependency is worse than no service graph, because someone will
 * believe it.
 */
export function composeToDiagram(text: string): DiagramImport | null {
  const services = parseComposeServices(text);
  if (services.size === 0) return null;

  const taken = new Map<string, string>();
  const lines: string[] = ["flowchart TD"];

  for (const [name, service] of services) {
    const id = idFor(name, taken);
    // The image is what the box actually is, so it goes under the name.
    const caption = service.image ? `${name}<br/>${service.image}` : name;
    // A datastore is drawn as one. It is the one inference here, it is made
    // from the image name rather than guessed, and it is only cosmetic.
    const store = /postgres|mysql|mariadb|mongo|redis|elastic|clickhouse|cassandra/i.test(
      service.image ?? "",
    );
    lines.push(`    ${id}${store ? `[("${label(caption)}")]` : `["${label(caption)}"]`}`);
  }

  for (const [name, service] of services) {
    const from = idFor(name, taken);
    for (const dependency of service.dependsOn) {
      if (!services.has(dependency)) continue;
      lines.push(`    ${from} --> ${idFor(dependency, taken)}`);
    }
  }

  return {
    kind: "compose",
    title: "docker-compose services",
    count: services.size,
    code: `${lines.join("\n")}\n`,
  };
}

// ─── SQL schemas ────────────────────────────────────────────────────────────

interface Column {
  name: string;
  type: string;
  key: "PK" | "FK" | null;
  /** From the column's own `NOT NULL`, which is what sets the cardinality. */
  required: boolean;
}

interface Table {
  name: string;
  columns: Column[];
  /** `[column, referencedTable]` for each foreign key. */
  references: [string, string][];
}

/**
 * `CREATE TABLE` statements as an entity-relationship diagram.
 *
 * Foreign keys become the relationships, which is the whole reason to draw an
 * ERD rather than list the tables — and they are stated in the DDL rather than
 * inferred, so the cardinalities are true. A `NOT NULL` foreign key is drawn
 * as exactly-one, a nullable one as zero-or-one, because that is what the
 * constraint says.
 */
export function sqlToDiagram(text: string): DiagramImport | null {
  const tables: Table[] = [];

  const statements = text.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?["'`[]?([\w.]+)["'`\]]?\s*\(([\s\S]*?)\)\s*(?:;|$)/gi,
  );

  for (const statement of statements) {
    const name = statement[1]!.split(".").pop()!;
    const body = statement[2]!;

    const columns: Column[] = [];
    const references: [string, string][] = [];
    const primaryKeys = new Set<string>();

    // Split on commas that are not inside parentheses, which is what separates
    // column definitions from each other and from table constraints.
    const parts: string[] = [];
    let depth = 0;
    let buffer = "";
    for (const char of body) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) {
        parts.push(buffer);
        buffer = "";
        continue;
      }
      buffer += char;
    }
    parts.push(buffer);

    for (const raw of parts) {
      const part = raw.trim();
      if (part === "") continue;

      const tableKey = /^primary\s+key\s*\(([^)]+)\)/i.exec(part);
      if (tableKey) {
        for (const column of tableKey[1]!.split(",")) {
          primaryKeys.add(column.trim().replace(/["'`[\]]/g, ""));
        }
        continue;
      }

      const tableFk =
        /^(?:constraint\s+\S+\s+)?foreign\s+key\s*\(([^)]+)\)\s*references\s+["'`[]?([\w.]+)["'`\]]?/i.exec(
          part,
        );
      if (tableFk) {
        const column = tableFk[1]!.trim().replace(/["'`[\]]/g, "");
        references.push([column, tableFk[2]!.split(".").pop()!]);
        continue;
      }

      // Anything else starting with an identifier is a column.
      const column =
        /^["'`[]?(\w+)["'`\]]?\s+([\w()", ]+?)(?:\s+(?:not\s+null|null|default|generated|primary|unique|references|check|collate)\b|$)/i.exec(
          part,
        );
      if (!column) continue;

      const columnName = column[1]!;
      const inlineFk = /references\s+["'`[]?([\w.]+)["'`\]]?/i.exec(part);
      if (inlineFk) references.push([columnName, inlineFk[1]!.split(".").pop()!]);
      if (/\bprimary\s+key\b/i.test(part)) primaryKeys.add(columnName);

      columns.push({
        name: columnName,
        type: column[2]!.trim().replace(/\s+/g, " "),
        key: null,
        required: /\bnot\s+null\b/i.test(part) || /\bprimary\s+key\b/i.test(part),
      });
    }

    const foreignKeys = new Set(references.map(([column]) => column));
    for (const column of columns) {
      column.key = primaryKeys.has(column.name) ? "PK" : foreignKeys.has(column.name) ? "FK" : null;
    }

    tables.push({ name, columns, references });
  }

  if (tables.length === 0) return null;

  const known = new Set(tables.map((table) => table.name.toLowerCase()));
  const lines: string[] = ["erDiagram"];

  for (const table of tables) {
    lines.push(`    ${table.name} {`);
    for (const column of table.columns) {
      // Mermaid's ERD attribute grammar is `type name [PK|FK]`, and the type
      // may not contain spaces or brackets.
      const type =
        column.type.replace(/[^\w]/g, "_").replace(/_+/g, "_").replace(/_$/, "") || "text";
      lines.push(`        ${type} ${column.name}${column.key ? ` ${column.key}` : ""}`);
    }
    lines.push("    }");
  }

  for (const table of tables) {
    for (const [column, target] of table.references) {
      if (!known.has(target.toLowerCase())) continue;
      const nullable = !table.columns.some((item) => item.name === column && item.required);
      lines.push(`    ${target} ${nullable ? "|o" : "||"}--o{ ${table.name} : "${label(column)}"`);
    }
  }

  return {
    kind: "sql",
    title: `${tables.length} table${tables.length === 1 ? "" : "s"}`,
    count: tables.length,
    code: `${lines.join("\n")}\n`,
  };
}

// ─── git log --graph ────────────────────────────────────────────────────────

/**
 * `git log --graph --oneline` as a gitgraph diagram.
 *
 * The ASCII gutter git draws to the left of each commit is not decoration —
 * it is the topology. The column the `*` sits in is which lane the commit is
 * on, and that is the only reliable way to know that two undecorated commits
 * belong to a side branch: refs only ever name the tip.
 *
 * So lanes come from the gutter and names come from the decorations git prints
 * in them. The log is newest-first and a gitgraph is drawn oldest-first, so it
 * is walked in reverse; merges are read off the subject line, which is the
 * one place git records what was merged into what.
 */
export function gitLogToDiagram(text: string): DiagramImport | null {
  interface Commit {
    sha: string;
    subject: string;
    /** Column of the `*` in the gutter, halved: 0 is the trunk. */
    lane: number;
    /** A branch name from this commit's ref decoration, if it has one. */
    ref: string | null;
    /** The branch this commit merged in, for a merge commit. */
    merged: string | null;
  }

  const commits: Commit[] = [];

  for (const line of text.split("\n")) {
    // A commit line has a `*` reachable through nothing but gutter characters.
    const marker = /^([\s|\\/_-]*)\*\s+/.exec(line);
    if (!marker) continue;

    const rest = line.slice(marker[0].length).trim();
    const sha = /^([0-9a-f]{6,40})\b/i.exec(rest);
    if (!sha) continue;

    const tail = rest.slice(sha[1]!.length).trim();
    const decoration = /^\(([^)]*)\)\s*(.*)$/.exec(tail);
    const subject = (decoration?.[2] ?? tail).trim();

    // `HEAD -> main, origin/main, tag: v1` → the first real branch name.
    const ref =
      (decoration?.[1] ?? "")
        .split(",")
        .map((entry) => entry.trim().replace(/^HEAD\s*->\s*/, ""))
        .filter((entry) => entry !== "" && !entry.startsWith("tag:") && entry !== "HEAD")
        .map((entry) => entry.replace(/^origin\//, ""))
        .at(0) ?? null;

    // `Merge branch 'x'` and `Merge pull request #12 from owner/x` both name
    // the branch; for a pull request it is the part after `from`, since `#12`
    // is the request and not the branch.
    const mergedBranch = /^Merge\s+branch\s+'([^']+)'/i.exec(subject)?.[1];
    const mergedPull = /^Merge\s+pull\s+request\s+#\d+\s+from\s+(\S+)/i.exec(subject)?.[1];
    const merged = (mergedBranch ?? mergedPull ?? null)?.replace(/^origin\//, "") ?? null;

    commits.push({
      sha: sha[1]!,
      subject,
      lane: Math.floor(marker[1]!.length / 2),
      ref,
      merged,
    });
  }

  if (commits.length === 0) return null;

  // Name each lane after the first decoration seen in it, reading newest-first
  // so the tip's own name wins. The trunk falls back to `main` rather than to
  // nothing, because a gitgraph has to start somewhere.
  const laneNames = new Map<number, string>();
  for (const commit of commits) {
    if (commit.ref && !laneNames.has(commit.lane)) laneNames.set(commit.lane, commit.ref);
  }
  const nameOf = (lane: number) => laneNames.get(lane) ?? (lane === 0 ? "main" : `branch-${lane}`);

  const trunk = nameOf(0);
  const lines: string[] = ["gitGraph"];
  const created = new Set<string>([trunk]);
  let current = trunk;

  for (const commit of [...commits].reverse()) {
    const branch = nameOf(commit.lane);

    if (branch !== current) {
      if (!created.has(branch)) {
        lines.push(`    branch ${branch}`);
        created.add(branch);
      }
      lines.push(`    checkout ${branch}`);
      current = branch;
    }

    // A merge of a branch we never saw a commit on would be a dangling
    // reference, so it is drawn as an ordinary commit instead.
    if (commit.merged && commit.merged !== current && created.has(commit.merged)) {
      lines.push(`    merge ${commit.merged}`);
      continue;
    }

    lines.push(`    commit id: "${label(commit.subject).slice(0, 48) || commit.sha}"`);
  }

  return {
    kind: "git-log",
    title: `${commits.length} commit${commits.length === 1 ? "" : "s"}`,
    count: commits.length,
    code: `${lines.join("\n")}\n`,
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Tries every parser and returns the one that recognised the text.
 *
 * Order matters only where two formats could both match, which in practice
 * they cannot — a compose file has `services:`, DDL has `CREATE TABLE`, a
 * trace has frames, a log has shas. Returning null is the normal outcome for
 * ordinary pasted text, and the caller should treat it as "this is just text".
 */
export function importDiagram(text: string): DiagramImport | null {
  if (text.trim().length < 8) return null;

  return (
    composeToDiagram(text) ??
    sqlToDiagram(text) ??
    stackTraceToDiagram(text) ??
    gitLogToDiagram(text)
  );
}
