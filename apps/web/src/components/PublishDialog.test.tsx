// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note, Workspace } from "@forkleaf/types";
import { PublishDialog } from "./PublishDialog";

vi.mock("@/lib/gateway", () => ({
  ApiGatewayError: class extends Error {},
  publishNote: vi.fn(),
  unpublishNote: vi.fn(),
}));

vi.mock("@forkleaf/exporter", () => ({ toHtml: () => "<html></html>" }));

afterEach(cleanup);

const NOTES = { owner: "me", repo: "forkleaf-notes", branch: "main", directory: "" };

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "me/forkleaf-notes@main:",
    name: "notes",
    repo: NOTES,
    isDefault: false,
    isLocal: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const note = {
  id: "n1",
  path: "recon.md",
  content: "# Recon\n\nSome prose.",
  frontmatter: {},
} as unknown as Note;

function view(props: Partial<React.ComponentProps<typeof PublishDialog>> = {}) {
  return render(
    <PublishDialog
      note={note}
      workspace={workspace()}
      published={undefined}
      onSetTarget={vi.fn()}
      onChanged={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("PublishDialog — choosing where pages go", () => {
  it("offers the choice before anything has been published", async () => {
    // The bug this pins: the chooser first rendered only in the published
    // view, so a private notebook — which cannot publish at all on a free
    // plan — could never reach the one control that fixes that.
    view();

    expect(screen.getByText("Pages go to")).toBeTruthy();
    expect(screen.getByRole("button", { name: /use another repository/i })).toBeTruthy();
  });

  it("names the notes' own repository as the default", () => {
    view();
    expect(screen.getByText("me/forkleaf-notes")).toBeTruthy();
  });

  it("says when pages go somewhere else", () => {
    view({
      workspace: workspace({
        publishRepo: { owner: "me", repo: "site", branch: "main", directory: "" },
      }),
    });

    expect(screen.getByText("me/site")).toBeTruthy();
    expect(screen.getByText(/not the repository your notes are in/i)).toBeTruthy();
  });

  it("records a repository that was typed in", async () => {
    const onSetTarget = vi.fn();
    view({ onSetTarget });

    fireEvent.click(screen.getByRole("button", { name: /use another repository/i }));
    fireEvent.change(screen.getByLabelText(/repository to publish into/i), {
      target: { value: "me/site" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(onSetTarget).toHaveBeenCalledWith(
        expect.objectContaining({ owner: "me", repo: "site", directory: "" }),
      ),
    );
  });

  it("refuses something that is not an owner/repository name", async () => {
    const onSetTarget = vi.fn();
    view({ onSetTarget });

    fireEvent.click(screen.getByRole("button", { name: /use another repository/i }));
    fireEvent.change(screen.getByLabelText(/repository to publish into/i), {
      target: { value: "not a repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText(/not an owner\/repository name/i)).toBeTruthy());
    expect(onSetTarget).not.toHaveBeenCalled();
  });

  it("clears the target when the box is emptied", async () => {
    const onSetTarget = vi.fn();
    view({
      onSetTarget,
      workspace: workspace({
        publishRepo: { owner: "me", repo: "site", branch: "main", directory: "" },
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    fireEvent.change(screen.getByLabelText(/repository to publish into/i), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onSetTarget).toHaveBeenCalledWith(null));
  });

  it("does not offer the control when the caller cannot store the choice", () => {
    view({ onSetTarget: undefined });

    expect(screen.getByText("Pages go to")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /use another repository/i })).toBeNull();
  });

  it("points at the fix when GitHub refuses for want of a paid plan", async () => {
    const { publishNote } = await import("@/lib/gateway");
    vi.mocked(publishNote).mockRejectedValue(
      Object.assign(
        new Error("Your current plan does not support GitHub Pages for this repository."),
        {
          name: "ApiGatewayError",
        },
      ),
    );

    view();
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    // GitHub's own message is accurate and says nothing about what to do next.
    await waitFor(() => expect(screen.getByText(/choose a public repository/i)).toBeTruthy());
  });
});
