import { describe, expect, it } from "vitest";
import { MAX_URL_LENGTH, isSavableUrl, normaliseOrigin, saveUrl } from "./save-url.js";

describe("isSavableUrl", () => {
  it("keeps web addresses only", () => {
    expect(isSavableUrl("https://example.com/a")).toBe(true);
    expect(isSavableUrl("http://example.com")).toBe(true);
    for (const bad of [
      "chrome://settings",
      "file:///x",
      "data:image/png;base64,AA",
      "javascript:x",
      "",
      null,
      undefined,
    ]) {
      expect(isSavableUrl(bad)).toBe(false);
    }
  });
});

describe("normaliseOrigin", () => {
  it("accepts https anywhere and http only on this machine", () => {
    expect(normaliseOrigin(" https://notes.example.com/editor?x=1 ")).toBe(
      "https://notes.example.com",
    );
    expect(normaliseOrigin("http://localhost:3001")).toBe("http://localhost:3001");
    expect(normaliseOrigin("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
    expect(normaliseOrigin("http://notes.example.com")).toBeNull();
    expect(normaliseOrigin("javascript:alert(1)")).toBeNull();
    expect(normaliseOrigin(42)).toBeNull();
  });
});

describe("saveUrl", () => {
  const origin = "https://forkleaf.vercel.app";

  it("builds the save address the app reads", () => {
    const url = new URL(
      saveUrl(origin, {
        kind: "quote",
        url: "https://a.com/p",
        title: " A page ",
        text: "Some words",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://forkleaf.vercel.app/save");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      save: "1",
      kind: "quote",
      url: "https://a.com/p",
      title: "A page",
      text: "Some words",
    });
  });

  it("leaves out what is empty or unsafe", () => {
    const url = new URL(
      saveUrl(origin, { kind: "link", url: "javascript:alert(1)", title: "", text: "" }),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({ save: "1", kind: "link" });
  });

  it("cuts a long selection to fit, and says it was cut", () => {
    const long = "é ".repeat(20000);
    const address = saveUrl(origin, {
      kind: "quote",
      url: "https://a.com",
      title: "T",
      text: long,
    });
    expect(address.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    const text = new URL(address).searchParams.get("text")!;
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeGreaterThan(1000);
  });
});
