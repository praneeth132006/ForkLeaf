import { describe, expect, it } from "vitest";
import {
  diffLines,
  extractCode,
  fenceFor,
  normaliseRepo,
  parseLiveCode,
  sameCode,
  serializeLiveCode,
} from "./live-code";

const TS = `import { db } from "./db";

const LIMIT = 5;

/**
 * Signs a user in.
 */
export async function login({ user, password }: Credentials): Promise<{ ok: boolean }> {
  if (!user) {
    return { ok: false };
  }
  const row = await db.find("users", { name: user });
  return { ok: row?.password === password };
}

export const logout = (id: string) => {
  db.delete("sessions", id);
};

export class Session {
  start() {
    return "}"; // a brace in a string
  }
}
`;

describe("parseLiveCode / serializeLiveCode", () => {
  it("reads the header and the copy of the code", () => {
    expect(
      parseLiveCode(
        "repo: https://github.com/acme/api.git\npath: /src/auth.ts\nsymbol: login\nref: main\n---\nfunction login() {}\n",
      ),
    ).toEqual({
      repo: "acme/api",
      path: "src/auth.ts",
      symbol: "login",
      lines: null,
      ref: "main",
      snapshot: "function login() {}",
    });
  });

  it("reads a line range, and ignores lines it does not know", () => {
    const spec = parseLiveCode("path: a.py\nlines: 10-14\ncolour: blue");
    expect(spec.lines).toEqual({ from: 10, to: 14 });
    expect(parseLiveCode("path: a.py\nlines: 7").lines).toEqual({ from: 7, to: 7 });
    expect(parseLiveCode("path: a.py\nlines: 9-2").lines).toBeNull();
  });

  it("round-trips", () => {
    const text =
      "repo: acme/api\npath: src/auth.ts\nsymbol: login\n---\nconst a = 1;\n\nconst b = 2;";
    expect(serializeLiveCode(parseLiveCode(text))).toBe(text);
  });

  it("writes no divider before the first fetch", () => {
    expect(serializeLiveCode(parseLiveCode("path: x.ts\nsymbol: y"))).toBe("path: x.ts\nsymbol: y");
  });

  it("makes a fence longer than any backticks in the code", () => {
    expect(fenceFor("no ticks")).toBe("```");
    expect(fenceFor("a ``` b ````")).toBe("`````");
  });

  it("accepts owner/name or a GitHub address, and nothing else", () => {
    expect(normaliseRepo("acme/api")).toBe("acme/api");
    expect(normaliseRepo("https://github.com/acme/api/")).toBe("acme/api");
    expect(normaliseRepo("not a repo")).toBeNull();
    expect(normaliseRepo("")).toBeNull();
  });
});

describe("extractCode", () => {
  const spec = (symbol: string, path = "src/auth.ts") => ({ path, symbol, lines: null });

  it("finds a function with its doc comment, past destructured arguments and type literals", () => {
    const result = extractCode(TS, spec("login"));
    expect(result).toMatchObject({ found: true, from: 5, to: 14 });
    if (!result.found) return;
    expect(result.code.split("\n")[0]).toBe("/**");
    expect(result.code.split("\n").at(-1)).toBe("}");
  });

  it("finds an arrow function and a class, ignoring braces in strings", () => {
    const logout = extractCode(TS, spec("logout"));
    expect(logout).toMatchObject({ found: true, from: 16, to: 18 });
    const session = extractCode(TS, spec("Session"));
    expect(session).toMatchObject({ found: true, from: 20, to: 24 });
  });

  it("finds a constant that is a single statement", () => {
    expect(extractCode(TS, spec("LIMIT"))).toMatchObject({ found: true, code: "const LIMIT = 5;" });
  });

  it("finds a method inside a class, dedented", () => {
    const start = extractCode(TS, spec("start"));
    expect(start).toMatchObject({ found: true, from: 21, to: 23 });
    if (start.found) expect(start.code.startsWith("start() {")).toBe(true);
  });

  it("finds a Python function by its indentation, decorators included", () => {
    const python = [
      "import os",
      "",
      "@cache",
      "def load(path):",
      "    with open(path) as f:",
      "",
      "        return f.read()",
      "",
      "def other():",
      "    pass",
    ].join("\n");
    expect(extractCode(python, spec("load", "io.py"))).toEqual({
      found: true,
      code: "@cache\ndef load(path):\n    with open(path) as f:\n\n        return f.read()",
      from: 3,
      to: 7,
    });
  });

  it("finds Go, Rust and Java declarations", () => {
    const go = "package x\n\nfunc (s *Server) Serve(w http.ResponseWriter) {\n\tw.Write(nil)\n}\n";
    expect(extractCode(go, spec("Serve", "s.go"))).toMatchObject({ found: true, from: 3, to: 5 });
    const rust = "pub async fn run(cfg: Config) -> Result<()> {\n    Ok(())\n}\n";
    expect(extractCode(rust, spec("run", "main.rs"))).toMatchObject({
      found: true,
      from: 1,
      to: 3,
    });
    const java = "class A {\n  public static int add(int a, int b) {\n    return a + b;\n  }\n}\n";
    expect(extractCode(java, spec("add", "A.java"))).toMatchObject({ found: true, from: 2, to: 4 });
  });

  it("finds a Ruby method up to its end", () => {
    const ruby = "class A\n  def greet\n    puts 'hi'\n  end\n\n  def other; end\nend\n";
    expect(extractCode(ruby, spec("greet", "a.rb"))).toMatchObject({ found: true, from: 2, to: 4 });
  });

  it("says plainly when the symbol has gone", () => {
    expect(extractCode(TS, spec("register"))).toEqual({
      found: false,
      reason: "“register” is not in src/auth.ts any more.",
    });
  });

  it("takes a line range, and says when the file got shorter", () => {
    expect(
      extractCode("a\n  b\n  c\nd", { path: "x", symbol: null, lines: { from: 2, to: 3 } }),
    ).toEqual({
      found: true,
      code: "b\nc",
      from: 2,
      to: 3,
    });
    expect(extractCode("a\nb", { path: "x", symbol: null, lines: { from: 9, to: 10 } })).toEqual({
      found: false,
      reason: "x has 2 lines now, so line 9 is gone.",
    });
  });
});

describe("comparing", () => {
  it("treats trailing spaces and line endings as the same code", () => {
    expect(sameCode("a  \r\nb\n", "a\nb")).toBe(true);
    expect(sameCode("a\nb", "a\nc")).toBe(false);
  });

  it("diffs line by line", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "B" },
      { kind: "same", text: "c" },
      { kind: "added", text: "d" },
    ]);
  });
});
