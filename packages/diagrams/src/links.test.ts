// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractDiagramLinks, hasDiagramLinks, markLinkedNodes, normalizeLabel } from "./links";

describe("extractDiagramLinks", () => {
  it("leaves the words on the box and takes the link out", () => {
    const { code, links } = extractDiagramLinks('flowchart TD\n  A["[[Deploy runbook]]"] --> B');

    // Mermaid never sees the brackets: it would render them, or read them as
    // one of its own shapes.
    expect(code).toBe('flowchart TD\n  A["Deploy runbook"] --> B');
    expect(links).toEqual([{ label: "Deploy runbook", target: "Deploy runbook", anchor: null }]);
  });

  it("uses the alias as the label and the target as the destination", () => {
    const { code, links } = extractDiagramLinks(
      'flowchart TD\n  A["[[deploy/runbook|The runbook]]"]',
    );

    expect(code).toContain('"The runbook"');
    expect(links[0]).toEqual({
      label: "The runbook",
      target: "deploy/runbook",
      anchor: null,
    });
  });

  it("carries an anchor through to the click", () => {
    const { links } = extractDiagramLinks('flowchart TD\n  A["[[Runbook#Rollback]]"]');
    expect(links[0]?.anchor).toBe("Rollback");
  });

  it("finds every link in the diagram", () => {
    const { links } = extractDiagramLinks(
      'flowchart TD\n  A["[[One]]"] --> B["[[Two]]"] --> C[Plain]',
    );

    expect(links.map((link) => link.target)).toEqual(["One", "Two"]);
  });

  it("leaves an ordinary diagram exactly as it was", () => {
    const code = "flowchart TD\n  A[Start] --> B[End]";
    expect(extractDiagramLinks(code)).toEqual({ code, links: [] });
  });

  it("ignores an empty link, which is a typo rather than a destination", () => {
    const code = 'flowchart TD\n  A["[[ ]]"]';
    expect(extractDiagramLinks(code).links).toEqual([]);
  });
});

describe("hasDiagramLinks", () => {
  it("answers without doing the work, and does not get stuck on its own state", () => {
    const code = 'flowchart TD\n  A["[[One]]"]';

    // A global regex remembers where it got to; asking twice must not answer
    // differently the second time.
    expect(hasDiagramLinks(code)).toBe(true);
    expect(hasDiagramLinks(code)).toBe(true);
    expect(hasDiagramLinks("flowchart TD\n  A[One]")).toBe(false);
  });
});

describe("normalizeLabel", () => {
  it("collapses the whitespace mermaid adds when it lays a label out", () => {
    expect(normalizeLabel("Deploy\n  runbook ")).toBe("Deploy runbook");
  });
});

describe("markLinkedNodes", () => {
  /** A rendered flowchart, in the shape mermaid produces. */
  function drawn(labels: string[]): HTMLElement {
    const root = document.createElement("figure");
    root.innerHTML = `<svg>${labels
      .map(
        (label, index) =>
          `<g class="node" id="flowchart-${index}"><rect></rect><g class="label"><span class="nodeLabel">${label}</span></g></g>`,
      )
      .join("")}</svg>`;
    return root;
  }

  it("marks the box whose words match, and only that one", () => {
    const root = drawn(["Deploy runbook", "Something else"]);

    const marked = markLinkedNodes(root, [
      { label: "Deploy runbook", target: "deploy/runbook.md", anchor: null },
    ]);

    expect(marked).toBe(1);
    const linked = root.querySelectorAll("[data-fl-note]");
    expect(linked).toHaveLength(1);
    expect(linked[0]?.getAttribute("data-fl-note")).toBe("deploy/runbook.md");
    expect(linked[0]?.classList.contains("fl-diagram-link")).toBe(true);
  });

  it("matches through the whitespace mermaid puts in a wrapped label", () => {
    const root = drawn(["Deploy\n   runbook"]);

    expect(markLinkedNodes(root, [{ label: "Deploy runbook", target: "x.md", anchor: null }])).toBe(
      1,
    );
  });

  it("keeps the anchor, so a click can land on the right heading", () => {
    const root = drawn(["Runbook"]);
    markLinkedNodes(root, [{ label: "Runbook", target: "runbook", anchor: "Rollback" }]);

    expect(root.querySelector("[data-fl-note]")?.getAttribute("data-fl-anchor")).toBe("Rollback");
  });

  it("marks two boxes that say the same thing, because they mean the same thing", () => {
    const root = drawn(["Runbook", "Runbook"]);
    expect(markLinkedNodes(root, [{ label: "Runbook", target: "x", anchor: null }])).toBe(2);
  });

  it("reports nothing marked when mermaid drew something it does not recognise", () => {
    const root = document.createElement("figure");
    root.innerHTML = "<svg><g class='mystery'>Runbook</g></svg>";

    // Worth distinguishing from "no links": it means the shape of the output
    // has moved, and pretending otherwise would hide that.
    expect(markLinkedNodes(root, [{ label: "Runbook", target: "x", anchor: null }])).toBe(0);
  });

  it("does nothing at all for a diagram with no links in it", () => {
    const root = drawn(["Start", "End"]);
    expect(markLinkedNodes(root, [])).toBe(0);
    expect(root.querySelector("[data-fl-note]")).toBeNull();
  });
});
