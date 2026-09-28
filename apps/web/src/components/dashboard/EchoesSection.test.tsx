// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EchoesSection } from "./EchoesSection";

const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
    },
  });
});
afterEach(() => {
  cleanup();
  store.clear();
});

const sources = [
  {
    id: "a",
    path: "journal/2026-09-27.md",
    title: "Saturday",
    text: "I am now sure the onboarding flow is far too long for new users.",
  },
];

describe("EchoesSection", () => {
  it("shows yesterday's line and remembers the answer", () => {
    render(
      <EchoesSection
        sources={sources}
        today="2026-09-28"
        hrefFor={(s) => `/editor?note=${s.path}`}
      />,
    );
    expect(screen.getByTestId("echo").textContent).toContain("onboarding flow is far too long");
    expect(screen.getByText(/Yesterday · 2026-09-27/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Still true" }));
    expect(screen.getByText("Still true", { selector: "p" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Still true" })).toBeNull();
  });

  it("links to the note to rethink it", () => {
    render(
      <EchoesSection
        sources={sources}
        today="2026-09-28"
        hrefFor={(s) => `/editor?note=${s.path}`}
      />,
    );
    expect(screen.getByRole("link", { name: "Changed my mind" }).getAttribute("href")).toBe(
      "/editor?note=journal/2026-09-27.md",
    );
  });

  it("renders nothing without a dated note", () => {
    const { container } = render(
      <EchoesSection sources={[]} today="2026-09-28" hrefFor={() => "/"} />,
    );
    expect(container.textContent).toBe("");
  });
});
