import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./app-url";

/**
 * Where a sign-in is allowed to end.
 *
 * Signing in again from the editor carries a destination through the OAuth
 * round trip, which is exactly the shape of an open redirect: a value from a
 * query string that a browser is later told to follow. Everything that is not
 * plainly a path on this deployment has to be refused rather than repaired.
 */
describe("safeReturnPath", () => {
  it("keeps a path on this deployment, query string and all", () => {
    expect(safeReturnPath("/editor")).toBe("/editor");
    expect(safeReturnPath("/editor?path=notes%2Fa.md")).toBe("/editor?path=notes%2Fa.md");
  });

  it("refuses another origin, however it is spelled", () => {
    expect(safeReturnPath("https://evil.example/steal")).toBeNull();
    // Protocol-relative: a browser reads this as another host entirely.
    expect(safeReturnPath("//evil.example/steal")).toBeNull();
    expect(safeReturnPath("/\\evil.example/steal")).toBeNull();
    expect(safeReturnPath("javascript:alert(1)")).toBeNull();
  });

  it("refuses anything that could split a header", () => {
    expect(safeReturnPath("/editor\r\nSet-Cookie: a=b")).toBeNull();
  });

  it("refuses nothing at all", () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath("")).toBeNull();
    expect(safeReturnPath(`/${"a".repeat(600)}`)).toBeNull();
  });

  it("drops a fragment, which the server has no use for", () => {
    expect(safeReturnPath("/editor#section")).toBe("/editor");
  });
});
