import { describe, expect, it } from "vitest";
import { ApiError } from "./api-helpers";
import { pagePath, pageUrl, slugOfPage } from "./publish";

/**
 * The slug becomes a path in the user's repository and a segment of a public
 * URL, so the cases that matter are the hostile ones: a name that is really a
 * path, or one that climbs out of the folder it is meant to be written into.
 */

describe("pagePath", () => {
  it("puts an ordinary note under docs/", () => {
    expect(pagePath("q3-roadmap")).toBe("docs/q3-roadmap.html");
    expect(pagePath("notes_2026.v2")).toBe("docs/notes_2026.v2.html");
  });

  it("lowercases, so one note cannot have two addresses", () => {
    expect(pagePath("Q3-Roadmap")).toBe("docs/q3-roadmap.html");
  });

  it("refuses anything that would write outside docs/", () => {
    for (const slug of [
      "",
      " ",
      "..",
      "../index",
      "a/b",
      "/etc/passwd",
      ".hidden",
      "-leading",
      "has space",
      "quote'",
      "x".repeat(90),
    ]) {
      expect(() => pagePath(slug)).toThrow(ApiError);
    }
  });

  it("refuses a missing slug rather than inventing one", () => {
    expect(() => pagePath(undefined)).toThrow(ApiError);
  });
});

describe("pageUrl", () => {
  it("joins the site and the page without doubling the slash", () => {
    expect(pageUrl("https://me.github.io/notes/", "roadmap")).toBe(
      "https://me.github.io/notes/roadmap.html",
    );
    expect(pageUrl("https://me.github.io/notes", "roadmap")).toBe(
      "https://me.github.io/notes/roadmap.html",
    );
  });
});

/**
 * Reading the folder back is how the app knows what is published, so the
 * question this answers is "did ForkLeaf write this file". `docs/` is an
 * ordinary folder people keep ordinary things in, and offering to unpublish
 * somebody's hand-written site would be worse than not listing it at all.
 */
describe("slugOfPage", () => {
  it("recognises a page this app would have written", () => {
    expect(slugOfPage("q3-roadmap.html")).toBe("q3-roadmap");
    expect(slugOfPage("notes_2026.v2.html")).toBe("notes_2026.v2");
  });

  it("matches the address the page was published at, not its spelling", () => {
    // `pagePath` lowercases, so the file on disk is lowercase and this is the
    // slug that will round-trip back through it.
    expect(slugOfPage("Q3-Roadmap.html")).toBe("q3-roadmap");
  });

  it("passes over anything that is not one of its pages", () => {
    for (const name of [
      "index.md",
      "README.md",
      "style.css",
      ".nojekyll",
      "-leading.html",
      "x".repeat(90) + ".html",
      "html",
      "",
    ]) {
      expect(slugOfPage(name)).toBeNull();
    }
  });

  it("agrees with pagePath, so a listed page can always be unpublished", () => {
    const slug = slugOfPage("q3-roadmap.html")!;
    expect(pagePath(slug)).toBe("docs/q3-roadmap.html");
  });
});
