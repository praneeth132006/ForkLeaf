import { describe, expect, it } from "vitest";
import { buildGlossary, definitionsIn, keyOf } from "./glossary";

const source = (path: string, content: string) => ({
  path,
  title: path.replace(/\.md$/, ""),
  content,
});

describe("definitionsIn", () => {
  it("reads a bold term defined with is, means, refers to or a colon", () => {
    const entries = definitionsIn(
      source(
        "cs.md",
        [
          "**Idempotent** means running it twice changes nothing. More detail here.",
          "**An event loop** is the scheduler that runs callbacks one at a time.",
          "- **CAP theorem**: a distributed store can't have all three of consistency, availability and partitions.",
          "**Latency** refers to how long a single request takes.",
          "**Throughput** — how many requests finish per second.",
        ].join("\n"),
      ),
    );
    expect(entries.map((entry) => [entry.term, entry.definition, entry.line])).toEqual([
      ["Idempotent", "Idempotent means running it twice changes nothing.", 1],
      ["event loop", "An event loop is the scheduler that runs callbacks one at a time.", 2],
      [
        "CAP theorem",
        "A distributed store can't have all three of consistency, availability and partitions.",
        3,
      ],
      ["Latency", "Latency refers to how long a single request takes.", 4],
      ["Throughput", "How many requests finish per second.", 5],
    ]);
  });

  it("reads term: definition lines under a Glossary heading only", () => {
    const entries = definitionsIn(
      source(
        "terms.md",
        "- Note: not a definition, no glossary yet\n\n## Glossary\n\n- Backlink: a link pointing at this note\n- Wikilink — a [[double bracket]] link\n\n## Later\n\n- Other: not counted",
      ),
    );
    expect(entries.map((entry) => [entry.term, entry.definition])).toEqual([
      ["Backlink", "A link pointing at this note"],
      ["Wikilink", "A double bracket link"],
    ]);
  });

  it("ignores bold text that is only emphasis, and code", () => {
    expect(
      definitionsIn(
        source("a.md", "This is **really** important.\n\n```\n**Fake** is not real\n```"),
      ),
    ).toEqual([]);
  });
});

describe("buildGlossary", () => {
  const glossary = buildGlossary([
    source("a.md", "**Idempotent** means running it twice changes nothing."),
    source("b.md", "**Event loop** is the scheduler.\n**Event** is something that happened."),
    source("c.md", "**API** is an application programming interface."),
  ]);

  it("finds terms whole-word, ignoring case, with plurals", () => {
    const text = "These endpoints are IDEMPOTENT. Idempotents everywhere, not idempotently.";
    expect(glossary.match(text).map((hit) => text.slice(hit.from, hit.to))).toEqual([
      "IDEMPOTENT",
      "Idempotents",
    ]);
  });

  it("prefers the longest term", () => {
    const text = "The event loop handles each event.";
    expect(glossary.match(text).map((hit) => [text.slice(hit.from, hit.to), hit.key])).toEqual([
      ["event loop", "event loop"],
      ["event", "event"],
    ]);
  });

  it("matches an acronym only in capitals", () => {
    const text = "Call the API, not the api; APIs and API's count.";
    expect(glossary.match(text).map((hit) => text.slice(hit.from, hit.to))).toEqual([
      "API",
      "APIs",
      "API's",
    ]);
  });

  it("keeps every definition of a term, first found first", () => {
    const both = buildGlossary([
      source("a.md", "**Cache** is fast storage."),
      source("b.md", "**Cache** is a place to keep copies."),
    ]);
    expect(both.entries.get("cache")?.map((entry) => entry.path)).toEqual(["a.md", "b.md"]);
  });

  it("finds nothing in an empty notebook", () => {
    expect(buildGlossary([]).match("anything at all")).toEqual([]);
  });
});

describe("keyOf", () => {
  it("is lower case except for acronyms", () => {
    expect(keyOf("Event  Loop")).toBe("event loop");
    expect(keyOf("API")).toBe("API");
  });
});
