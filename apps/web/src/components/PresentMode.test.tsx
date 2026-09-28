// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PresentMode } from "./PresentMode";

afterEach(cleanup);

const NOTE = "# Talk\n\nIntro\n\n## One\n\nFirst point\n\n## Two\n\nSecond point";

describe("PresentMode", () => {
  it("shows one section at a time and moves with the arrow keys", () => {
    render(<PresentMode title="Talk" markdown={NOTE} onClose={vi.fn()} />);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(screen.getByTestId("slide").textContent).toContain("Intro");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("slide").textContent).toContain("First point");
    fireEvent.keyDown(window, { key: "End" });
    expect(screen.getByText("3 / 3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("3 / 3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Home" });
    expect(screen.getByText("1 / 3")).toBeTruthy();
  });

  it("leaves on Escape", () => {
    const onClose = vi.fn();
    render(<PresentMode title="Talk" markdown={NOTE} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("presents an empty note as its title", () => {
    render(<PresentMode title="Blank" markdown="" onClose={vi.fn()} />);
    expect(screen.getByTestId("slide").textContent).toContain("Blank");
  });
});
