// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LineageDialog } from "./LineageDialog";

afterEach(cleanup);

const passage =
  "the billing service retries failed charges three times over a week before giving up";
const note = {
  path: "spec.md",
  title: "Spec",
  content: `We decided ${passage}.`,
  created: "2026-09-10",
};

describe("LineageDialog", () => {
  it("lists the notes passages were copied from, and opens them", async () => {
    const onOpenNote = vi.fn();
    render(
      <LineageDialog
        note={note}
        loadNotes={async () => [
          note,
          {
            path: "standup.md",
            title: "Standup",
            content: `Notes: ${passage}!`,
            created: "2026-09-01",
          },
        ]}
        linksTo={[{ path: "billing.md", title: "billing" }]}
        linkedFrom={[]}
        onOpenNote={onOpenNote}
        onClose={vi.fn()}
      />,
    );
    const relative = await screen.findByTestId("relative");
    expect(relative.textContent).toContain("Written before this one");
    expect(relative.textContent).toContain("billing service retries failed charges");
    fireEvent.click(screen.getByRole("button", { name: "Standup" }));
    expect(onOpenNote).toHaveBeenCalledWith("standup.md");
    expect(screen.getByRole("button", { name: "billing" })).toBeTruthy();
    expect(screen.getByText("Nothing links here.")).toBeTruthy();
  });

  it("says when nothing was copied in or out", async () => {
    render(
      <LineageDialog
        note={note}
        loadNotes={async () => [note]}
        linksTo={[]}
        linkedFrom={[]}
        onOpenNote={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText(/nothing was copied in or out/)).toBeTruthy();
  });
});
