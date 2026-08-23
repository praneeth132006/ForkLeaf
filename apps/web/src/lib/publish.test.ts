import { describe, expect, it } from "vitest";
import { ApiError } from "./api-helpers";
import { pagePath, pageUrl } from "./publish";

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
