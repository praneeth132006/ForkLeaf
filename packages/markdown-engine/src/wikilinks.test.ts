import { describe, expect, it } from "vitest";
import {
  buildLinkGraph,
  extractWikilinks,
  resolveWikilink,
  wikilinkTargets,
  wikilinkToPath,
} from "./wikilinks";
import { markdownToHtml } from "./render";

describe("extractWikilinks", () => {
  it("reads a plain link", () => {
    const [link] = extractWikilinks("See [[Roadmap]] for the plan.");
    expect(link).toMatchObject({ target: "Roadmap", label: "Roadmap", anchor: null, embed: false });
    expect("See [[Roadmap]] for the plan.".slice(link!.start, link!.end)).toBe("[[Roadmap]]");
  });

  it("reads an alias and an anchor", () => {
    expect(extractWikilinks("[[projects/q3|the plan]]")[0]).toMatchObject({
      target: "projects/q3",
      label: "the plan",
    });
    expect(extractWikilinks("[[Roadmap#Q3]]")[0]).toMatchObject({
      target: "Roadmap",
      anchor: "Q3",
    });
    expect(extractWikilinks("[[Roadmap#Q3|later]]")[0]).toMatchObject({
      target: "Roadmap",
      anchor: "Q3",
      label: "later",
    });
  });

  it("marks embeds", () => {
    expect(extractWikilinks("![[diagram]]")[0]).toMatchObject({ target: "diagram", embed: true });
  });

  it("ignores links inside code", () => {
    expect(extractWikilinks("`[[nope]]` and\n\n```\n[[also nope]]\n```\n")).toEqual([]);
    expect(extractWikilinks("~~~\n[[nope]]\n~~~\n[[yes]]")).toHaveLength(1);
  });

  it("does not run past a malformed link", () => {
    // The greedy failure mode: one stray bracket swallowing the paragraph.
    const links = extractWikilinks("[[a]] text ]] more [[b]]");
    expect(links.map((l) => l.target)).toEqual(["a", "b"]);
  });

  it("deduplicates targets", () => {
    expect(wikilinkTargets("[[a]] [[a|again]] [[b]]")).toEqual(["a", "b"]);
  });
});

describe("resolveWikilink", () => {
  const notes = [
    { path: "projects/q3-roadmap.md", title: "Q3 roadmap" },
    { path: "archive/q3-roadmap.md", title: "Old roadmap" },
    { path: "inbox.md", title: "Inbox" },
  ];

  it("matches an exact path, with or without the extension", () => {
    expect(resolveWikilink("projects/q3-roadmap.md", notes)?.path).toBe("projects/q3-roadmap.md");
    expect(resolveWikilink("projects/q3-roadmap", notes)?.path).toBe("projects/q3-roadmap.md");
  });

  it("matches a bare filename, breaking a tie on the title", () => {
    // Two notes share the filename. The one whose title also matches wins,
    // which is what makes `[[q3-roadmap]]` and `[[Q3 roadmap]]` agree.
    expect(resolveWikilink("q3-roadmap", notes)?.path).toBe("projects/q3-roadmap.md");
  });

  it("matches a title, ignoring case and spacing", () => {
    expect(resolveWikilink("Q3 Roadmap", notes)?.path).toBe("projects/q3-roadmap.md");
    expect(resolveWikilink("old roadmap", notes)?.path).toBe("archive/q3-roadmap.md");
  });

  it("returns null when nothing matches", () => {
    expect(resolveWikilink("nowhere", notes)).toBeNull();
  });
});

describe("wikilinkToPath", () => {
  it("puts a bare name beside the note that linked to it", () => {
    expect(wikilinkToPath("Ideas", "projects/q3.md")).toBe("projects/Ideas.md");
    expect(wikilinkToPath("Ideas", "q3.md")).toBe("Ideas.md");
  });

  it("keeps a target that already names a folder", () => {
    expect(wikilinkToPath("archive/ideas", "projects/q3.md")).toBe("archive/ideas.md");
    expect(wikilinkToPath("archive/ideas.md", "")).toBe("archive/ideas.md");
  });
});

describe("buildLinkGraph", () => {
  const sources = [
    { path: "a.md", title: "A", content: "Links to [[B]] and [[missing]]." },
    { path: "b.md", title: "B", content: "Back to [[A]]." },
    { path: "c.md", title: "C", content: "Also [[missing]]." },
  ];

  it("records backlinks with the line they were written on", () => {
    const graph = buildLinkGraph(sources);
    const inbound = graph.backlinks.get("b.md") ?? [];
    expect(inbound).toHaveLength(1);
    expect(inbound[0]).toMatchObject({ from: "a.md", to: "b.md" });
    expect(inbound[0]!.context).toBe("Links to [[B]] and [[missing]].");
  });

  it("collects unresolved targets, most wanted first", () => {
    const graph = buildLinkGraph(sources);
    expect(graph.unresolved).toEqual([{ target: "missing", from: ["a.md", "c.md"] }]);
  });

  it("does not count a note linking to itself as a backlink", () => {
    const graph = buildLinkGraph([{ path: "a.md", title: "A", content: "[[A]]" }]);
    expect(graph.backlinks.get("a.md")).toBeUndefined();
    expect(graph.outgoing.get("a.md")).toHaveLength(1);
  });
});

describe("rendering", () => {
  it("renders a wikilink as an anchor carrying its target", () => {
    const html = markdownToHtml("See [[Roadmap|the plan]].", {
      resolveWikilink: (link) => ({ href: `/editor?note=${link.target}`, exists: true }),
    });
    expect(html).toContain('href="/editor?note=Roadmap"');
    expect(html).toContain('data-wikilink="Roadmap"');
    expect(html).toContain(">the plan</a>");
  });

  it("marks a link to a note that does not exist", () => {
    const html = markdownToHtml("[[nowhere]]", {
      resolveWikilink: () => ({ href: "#", exists: false }),
    });
    expect(html).toContain("fl-wikilink-missing");
  });

  it("still renders as a link with no resolver", () => {
    expect(markdownToHtml("[[Roadmap]]")).toContain("fl-wikilink");
  });

  it("leaves wikilinks inside code alone", () => {
    expect(markdownToHtml("`[[Roadmap]]`")).not.toContain("fl-wikilink");
  });

  it("does not let note content smuggle in an arbitrary class", () => {
    const html = markdownToHtml("[[x]]", {
      resolveWikilink: () => ({ href: "javascript:alert(1)", exists: true }),
    });
    expect(html).not.toContain("javascript:");
  });
});
