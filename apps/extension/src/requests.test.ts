import { describe, expect, it } from "vitest";
import { requestForMenu, requestForPage } from "./requests.js";

const PAGE = {
  url: "https://a.com/essay",
  title: "An essay",
  description: "About things.",
  selection: "",
};
const TAB = { url: "https://a.com/essay?utm=x", title: "An essay | A.com" };

describe("requestForPage", () => {
  it("saves the page, or the selection as a quote", () => {
    expect(requestForPage(PAGE, TAB)).toEqual({
      kind: "page",
      url: "https://a.com/essay",
      title: "An essay",
      text: "About things.",
    });
    expect(requestForPage({ ...PAGE, selection: "line one\nline two" }, TAB)).toEqual({
      kind: "quote",
      url: "https://a.com/essay",
      title: "An essay",
      text: "line one\nline two",
    });
  });

  it("falls back to the tab's address when the page could not be read", () => {
    expect(requestForPage(null, TAB)).toEqual({
      kind: "link",
      url: TAB.url,
      title: TAB.title,
      text: "",
    });
  });

  it("saves nothing from the browser's own pages", () => {
    expect(requestForPage(null, { url: "chrome://newtab", title: "New Tab" })).toBeNull();
    expect(requestForPage(null, undefined)).toBeNull();
  });
});

describe("requestForMenu", () => {
  it("prefers the page's reading of a selection, which keeps line breaks", () => {
    expect(
      requestForMenu({ menuItemId: "quote", selectionText: "line one line two" }, TAB, {
        ...PAGE,
        selection: "line one\nline two",
      }),
    ).toMatchObject({ kind: "quote", text: "line one\nline two", url: PAGE.url });
    expect(
      requestForMenu(
        { menuItemId: "quote", selectionText: "flat", pageUrl: "https://b.com" },
        undefined,
        null,
      ),
    ).toEqual({ kind: "quote", url: "https://b.com", title: "", text: "flat" });
  });

  it("saves a link with its text as the title", () => {
    expect(
      requestForMenu(
        { menuItemId: "link", linkUrl: "https://c.com/x", selectionText: "C" },
        TAB,
        null,
      ),
    ).toEqual({ kind: "link", url: "https://c.com/x", title: "C", text: "" });
  });

  it("saves an image with an address, and not a data: image", () => {
    expect(
      requestForMenu({ menuItemId: "image", srcUrl: "https://a.com/i.png" }, TAB, null),
    ).toEqual({
      kind: "image",
      url: "https://a.com/i.png",
      title: TAB.title,
      text: "",
    });
    expect(
      requestForMenu({ menuItemId: "image", srcUrl: "data:image/png;base64,AAAA" }, TAB, null),
    ).toBeNull();
  });

  it("treats the page item like the toolbar button", () => {
    expect(requestForMenu({ menuItemId: "page" }, TAB, PAGE)).toEqual(requestForPage(PAGE, TAB));
  });
});
