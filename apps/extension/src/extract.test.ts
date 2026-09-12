// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { extractPage } from "./extract.js";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.title = "";
  window.getSelection()?.removeAllRanges();
});

describe("extractPage", () => {
  it("reads the page's own title, description and canonical address", () => {
    document.title = "Fallback title";
    document.head.innerHTML = `
      <meta property="og:title" content="  The real   title ">
      <meta name="description" content="What this page is about.">
      <link rel="canonical" href="/articles/42">`;
    const page = extractPage();
    expect(page.title).toBe("The real title");
    expect(page.description).toBe("What this page is about.");
    expect(page.url).toBe(new URL("/articles/42", location.href).href);
    expect(page.selection).toBe("");
  });

  it("falls back to the document title and the address bar", () => {
    // Head first: replacing the head's contents afterwards would remove the
    // <title> element that setting `document.title` creates.
    document.head.innerHTML = `<link rel="canonical" href="javascript:alert(1)">`;
    document.title = "Just a title";
    const page = extractPage();
    expect(page.title).toBe("Just a title");
    expect(page.url).toBe(location.href);
  });

  it("reads the selected text", () => {
    document.body.innerHTML = "<p id=p>Keep this sentence.</p><p>Not this.</p>";
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("p")!);
    window.getSelection()!.addRange(range);
    expect(extractPage().selection).toBe("Keep this sentence.");
  });

  it("stands alone, so it can be sent into a tab", () => {
    const source = extractPage.toString();
    expect(source).not.toMatch(/\bimport\b|\brequire\(/);
  });
});
