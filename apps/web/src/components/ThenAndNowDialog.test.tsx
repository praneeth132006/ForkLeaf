// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThenAndNowDialog } from "./ThenAndNowDialog";

afterEach(cleanup);

const commits = [
  { sha: "new", date: "2026-09-01T00:00:00Z", message: "Latest" },
  { sha: "mid", date: "2026-03-01T00:00:00Z", message: "Spring rewrite" },
  { sha: "old", date: "2025-08-01T00:00:00Z", message: "First draft" },
];
const texts: Record<string, string> = {
  new: "# Plan\n\nToday.",
  mid: "# Plan\n\nSpring idea.",
  old: "# Plan\n\nOld idea.",
};

function open() {
  const readAt = vi.fn(async (sha: string) => texts[sha] ?? null);
  render(
    <ThenAndNowDialog
      title="Plan"
      now={"# Plan\n\nToday, with more words."}
      onClose={vi.fn()}
      loadHistory={vi.fn(async () => commits)}
      readAt={readAt}
      today="2026-09-28"
    />,
  );
  return readAt;
}

describe("ThenAndNowDialog", () => {
  it("compares today's note with the version from a year ago", async () => {
    const readAt = open();
    expect(await screen.findByText(/As it was 1 year ago/)).toBeTruthy();
    expect(readAt).toHaveBeenCalledWith("old");
    expect(await screen.findByTestId("then-and-now-stats")).toBeTruthy();
    expect(screen.getByText("First draft")).toBeTruthy();
  });

  it("moves to six months ago", async () => {
    const readAt = open();
    await screen.findByText(/As it was 1 year ago/);
    fireEvent.click(screen.getByRole("tab", { name: "Six months ago" }));
    expect(await screen.findByText("Spring rewrite")).toBeTruthy();
    expect(readAt).toHaveBeenCalledWith("mid");
  });
});
