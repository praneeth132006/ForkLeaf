// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Workspace } from "@forkleaf/types";
import { HelpDialog } from "./HelpDialog";

afterEach(cleanup);

const WORKSPACE: Workspace = {
  id: "w",
  name: "me/notes",
  repo: { owner: "me", repo: "notes", branch: "main", directory: "" },
  isDefault: true,
  isLocal: false,
  createdAt: "",
  lastOpenedAt: "",
};

function open(over: Partial<React.ComponentProps<typeof HelpDialog>> = {}) {
  render(
    <HelpDialog
      onClose={vi.fn()}
      user={{ login: "me", name: "Me", avatarUrl: null } as never}
      workspace={WORKSPACE}
      githubAvailable
      onSignIn={vi.fn()}
      onConnectRepo={vi.fn()}
      {...over}
    />,
  );
}

const tab = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));

/**
 * A feature nobody can find is a feature nobody has. These assert that each
 * one is named here under the words somebody would actually go looking for —
 * and, more importantly, that the exact command is written down, since "there
 * is a way to do that" is not an answer anybody can act on.
 */
describe("HelpDialog — every feature is findable", () => {
  it("offers a topic for each part of the app", () => {
    open();

    for (const name of [
      /Getting started/,
      /Writing/,
      /Papers & PDFs/,
      /Diagrams/,
      /Checks & history/,
      /GitHub & sync/,
      /Shortcuts/,
    ]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
  });

  it("names the papers features, and what to press for each", () => {
    open();
    tab(/Papers & PDFs/);

    expect(screen.getByText(/Read a paper in the notebook it belongs to/)).toBeTruthy();
    expect(screen.getByText("Quote into note")).toBeTruthy();
    expect(screen.getByText("Write about this")).toBeTruthy();
    expect(screen.getByText("Save to notebook")).toBeTruthy();
  });

  it("names the checks, each with its palette command", () => {
    open();
    tab(/Checks & history/);

    expect(screen.getByText("Check my citations against their documents")).toBeTruthy();
    expect(screen.getByText("Check which of my notes have gone stale")).toBeTruthy();
    expect(screen.getByText("Show me my notebook as it was on…")).toBeTruthy();
  });

  it("says how to make a diagram box into a note", () => {
    open();
    tab(/Diagrams/);

    expect(screen.getByText(/A box can be a note/)).toBeTruthy();
    expect(screen.getByText(/\[\[Deploy runbook\]\]/)).toBeTruthy();
  });

  it("says what to do about an image that will not send", () => {
    open();
    tab(/GitHub & sync/);

    expect(screen.getByText(/When an image is too big to send/)).toBeTruthy();
    expect(screen.getByText("Resize")).toBeTruthy();
  });

  it("tells every feature in the same three beats", () => {
    open();
    tab(/Papers & PDFs/);

    // What it is, what to press, what happens. A paragraph of prose about a
    // feature is a paragraph people skim and still do not know what to press.
    const entry = screen.getByText(/Start a note from a paper/).closest("div")!;
    expect(within(entry).getByText("Do")).toBeTruthy();
    expect(within(entry).getByText("You get")).toBeTruthy();
  });
});
