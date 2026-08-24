import { describe, expect, it } from "vitest";
import {
  composeToDiagram,
  gitLogToDiagram,
  importDiagram,
  sqlToDiagram,
  stackTraceToDiagram,
} from "./import";
import { detectKind } from "./templates";
import { mermaidToGraph } from "./graph-model";
import { mermaidToSequence } from "./sequence-model";

describe("stackTraceToDiagram", () => {
  const node = [
    "TypeError: Cannot read properties of undefined",
    "    at parseRow (/app/src/parse.js:31:12)",
    "    at Object.handler (/app/src/index.js:12:5)",
    "    at Server.emit (node:events:517:28)",
  ].join("\n");

  it("draws the call path as a sequence diagram", () => {
    const result = stackTraceToDiagram(node)!;

    expect(result.kind).toBe("stack-trace");
    expect(detectKind(result.code)).toBe("sequence");
    expect(result.count).toBe(3);
  });

  it("reads outermost-first, since that is the order things happened", () => {
    const result = stackTraceToDiagram(node)!;
    const diagram = mermaidToSequence(result.code)!;

    // The trace prints innermost first; the diagram starts where the call did.
    expect(diagram.participants[0]?.label).toBe("node:events");
    expect(diagram.messages.at(-1)?.label).toBe("parseRow");
  });

  it("marks the frame that threw with the arrow that means failure", () => {
    const diagram = mermaidToSequence(stackTraceToDiagram(node)!.code)!;
    expect(diagram.messages.at(-1)?.arrow).toBe("cross");
  });

  it("reads a Python traceback", () => {
    const result = stackTraceToDiagram(
      [
        "Traceback (most recent call last):",
        '  File "/app/main.py", line 12, in handler',
        "    parse(row)",
        '  File "/app/parse.py", line 31, in parse',
        "    raise ValueError",
      ].join("\n"),
    )!;

    expect(result.title).toContain("Python");
    expect(result.code).toContain("main.py");
    expect(result.code).toContain("parse.py");
  });

  it("reads a Java stack trace", () => {
    const result = stackTraceToDiagram(
      [
        "java.lang.NullPointerException",
        "\tat com.example.Service.handle(Service.java:12)",
        "\tat com.example.Main.run(Main.java:5)",
      ].join("\n"),
    )!;

    expect(result.title).toContain("Java");
    expect(result.count).toBe(2);
  });

  it("declines ordinary prose", () => {
    expect(stackTraceToDiagram("We should probably rewrite the parser at some point.")).toBeNull();
  });

  it("declines a single frame, which is not a path", () => {
    expect(stackTraceToDiagram("    at handler (/app/index.js:1:1)")).toBeNull();
  });
});

describe("composeToDiagram", () => {
  const compose = [
    "version: '3.9'",
    "services:",
    "  web:",
    "    image: nginx:alpine",
    "    depends_on:",
    "      - api",
    "  api:",
    "    build: .",
    "    depends_on:",
    "      db:",
    "        condition: service_healthy",
    "      cache:",
    "  db:",
    "    image: postgres:16",
    "  cache:",
    "    image: redis:7",
  ].join("\n");

  it("draws the services and the edges the file actually declares", () => {
    const result = composeToDiagram(compose)!;
    const graph = mermaidToGraph(result.code)!;

    expect(result.count).toBe(4);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(3);
  });

  it("reads both the list and the condition form of depends_on", () => {
    const graph = mermaidToGraph(composeToDiagram(compose)!.code)!;
    const from = (id: string) => graph.edges.filter((edge) => edge.from === id).map((e) => e.to);

    expect(from("web")).toEqual(["api"]);
    expect(from("api").sort()).toEqual(["cache", "db"]);
  });

  it("draws a datastore as a datastore", () => {
    const graph = mermaidToGraph(composeToDiagram(compose)!.code)!;
    expect(graph.nodes.find((node) => node.id === "db")?.shape).toBe("cylinder");
    expect(graph.nodes.find((node) => node.id === "web")?.shape).toBe("rect");
  });

  it("reads the inline list form", () => {
    const graph = mermaidToGraph(
      composeToDiagram("services:\n  a:\n    depends_on: [b]\n  b:\n    image: redis\n")!.code,
    )!;

    expect(graph.edges).toHaveLength(1);
  });

  it("never invents a dependency that is not declared", () => {
    const graph = mermaidToGraph(
      composeToDiagram("services:\n  a:\n    image: nginx\n  b:\n    image: redis\n")!.code,
    )!;

    expect(graph.edges).toHaveLength(0);
  });

  it("declines a YAML file that is not a compose file", () => {
    expect(composeToDiagram("name: CI\non:\n  push:\n    branches: [main]\n")).toBeNull();
  });
});

describe("sqlToDiagram", () => {
  const schema = `
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      author_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT
    );

    CREATE TABLE comments (
      id SERIAL PRIMARY KEY,
      note_id INTEGER,
      CONSTRAINT fk_note FOREIGN KEY (note_id) REFERENCES notes (id)
    );
  `;

  it("draws every table as an entity", () => {
    const result = sqlToDiagram(schema)!;

    expect(result.count).toBe(3);
    expect(detectKind(result.code)).toBe("er");
  });

  it("keeps the columns, which is what an ERD is for", () => {
    const code = sqlToDiagram(schema)!.code;

    expect(code).toContain("email");
    expect(code).toContain("author_id");
  });

  it("marks primary and foreign keys", () => {
    const code = sqlToDiagram(schema)!.code;

    expect(code).toMatch(/id PK/);
    expect(code).toMatch(/author_id FK/);
  });

  it("turns foreign keys into relationships, in both spellings", () => {
    const code = sqlToDiagram(schema)!.code;

    expect(code).toContain("users ||--o{ notes");
    expect(code).toContain("comments");
    expect(code).toMatch(/notes \|?o?\|?--o\{ comments/);
  });

  it("declines text with no DDL in it", () => {
    expect(sqlToDiagram("SELECT * FROM users WHERE id = 1;")).toBeNull();
  });
});

describe("gitLogToDiagram", () => {
  const log = [
    "*   9f71e3e (HEAD -> main, origin/main) Merge pull request #20 from feature/auth",
    "|\\",
    "| * ece092a (feature/auth) Add sign-in route",
    "| * 0d58865 Add session cookie",
    "|/",
    "* 1fb9c40 Tidy the reader",
  ].join("\n");

  it("draws the commits oldest-first, the way a gitgraph reads", () => {
    const result = gitLogToDiagram(log)!;

    expect(result.count).toBe(4);
    expect(detectKind(result.code)).toBe("gitgraph");
    expect(result.code.indexOf("Tidy the reader")).toBeLessThan(
      result.code.indexOf("Add session cookie"),
    );
  });

  it("picks up branch names from the ref decorations", () => {
    expect(gitLogToDiagram(log)!.code).toContain("branch feature/auth");
  });

  it("draws a merge as a merge", () => {
    expect(gitLogToDiagram(log)!.code).toContain("merge feature/auth");
  });

  it("handles a plain linear log", () => {
    const result = gitLogToDiagram("* abc1234 Second\n* def5678 First\n")!;
    expect(result.count).toBe(2);
  });

  it("declines text with no commits in it", () => {
    expect(gitLogToDiagram("nothing here at all")).toBeNull();
  });
});

describe("importDiagram", () => {
  it("picks the parser that recognises the paste", () => {
    expect(importDiagram("services:\n  a:\n    image: redis\n")?.kind).toBe("compose");
    expect(importDiagram("CREATE TABLE t (id INT PRIMARY KEY);")?.kind).toBe("sql");
    expect(importDiagram("    at a (/x.js:1:1)\n    at b (/y.js:2:2)\n")?.kind).toBe("stack-trace");
    expect(importDiagram("* abc1234 One\n* def5678 Two\n")?.kind).toBe("git-log");
  });

  it("declines ordinary text, which is the common case", () => {
    expect(importDiagram("Here are some notes about the release.")).toBeNull();
    expect(importDiagram("hi")).toBeNull();
  });

  it("produces mermaid that parses", () => {
    const result = importDiagram("services:\n  a:\n    depends_on: [b]\n  b:\n    image: redis\n")!;
    expect(mermaidToGraph(result.code)).not.toBeNull();
  });
});
