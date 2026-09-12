// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MindDialog, proxiedImage } from "./MindDialog";
import { inboxNote } from "@/lib/inbox";

afterEach(cleanup);

const NOW = new Date(2026, 8, 13);
const note = (path: string, request: Parameters<typeof inboxNote>[0]) => {
  const made = inboxNote(request, NOW);
  return { path, title: made.title, content: made.content, frontmatter: made.frontmatter };
};

const NOTES = [
  note("inbox/lisbon.md", {
    kind: "quote",
    url: "https://en.wikipedia.org/wiki/Lisbon",
    title: "Lisbon",
    text: "Lisbon is the capital of Portugal.",
  }),
  note("inbox/tram.md", {
    kind: "image",
    url: "https://a.com/tram.jpg",
    title: "Tram 28",
    text: "",
  }),
  note("inbox/rust.md", {
    kind: "link",
    url: "https://blog.rust-lang.org/",
    title: "Rust blog",
    text: "",
  }),
];

function open(over: Partial<React.ComponentProps<typeof MindDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    loadNotes: vi.fn(async () => NOTES),
    onOpenNote: vi.fn(),
    onCopyBookmarklet: vi.fn(),
    ...over,
  };
  render(<MindDialog {...props} />);
  return props;
}

describe("MindDialog", () => {
  it("shows every saved thing as what it is", async () => {
    open();
    expect(await screen.findByText("Lisbon is the capital of Portugal.")).toBeTruthy();
    expect(screen.getByText("Tram 28")).toBeTruthy();
    expect(screen.getByText("Rust blog")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Everything 3/ })).toBeTruthy();
  });

  it("filters by kind and by search", async () => {
    open();
    await screen.findByText("Tram 28");
    fireEvent.click(screen.getByRole("button", { name: /Images 1/ }));
    expect(screen.queryByText("Rust blog")).toBeNull();
    expect(screen.getByText("Tram 28")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Everything/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "portugal" } });
    expect(screen.getByText("Lisbon")).toBeTruthy();
    expect(screen.queryByText("Tram 28")).toBeNull();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nothing like this" } });
    expect(screen.getByText("Nothing saved matches that.")).toBeTruthy();
  });

  it("opens the note, and the original in a new tab that cannot reach back", async () => {
    const props = open();
    fireEvent.click(await screen.findByRole("button", { name: "Open Rust blog" }));
    expect(props.onOpenNote).toHaveBeenCalledWith("inbox/rust.md");
    const original = screen.getAllByRole("link", { name: "Original" })[0]!;
    expect(original.getAttribute("target")).toBe("_blank");
    expect(original.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("loads pictures through ForkLeaf's proxy, and hides one that fails", async () => {
    open();
    await screen.findByText("Tram 28");
    const image = document.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(proxiedImage("https://a.com/tram.jpg"));
    expect(image.getAttribute("src")).toBe("/api/link-image?url=https%3A%2F%2Fa.com%2Ftram.jpg");
    fireEvent.error(image);
    expect(document.querySelector("img")).toBeNull();
  });

  it("explains how to save when nothing has been", async () => {
    const props = open({ loadNotes: vi.fn(async () => []) });
    fireEvent.click(await screen.findByRole("button", { name: "Copy the bookmarklet" }));
    expect(props.onCopyBookmarklet).toHaveBeenCalled();
  });

  it("says so when the inbox cannot be read", async () => {
    open({ loadNotes: vi.fn(async () => Promise.reject(new Error("Storage is locked."))) });
    expect((await screen.findByRole("alert")).textContent).toBe("Storage is locked.");
  });
});
