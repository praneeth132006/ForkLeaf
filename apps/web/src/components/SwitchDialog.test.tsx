// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SwitchDialog } from "./SwitchDialog";

afterEach(cleanup);

const repo = { owner: "me", repo: "notes", branch: "main" };

describe("SwitchDialog", () => {
  it("asks for something to do before offering a file", () => {
    render(<SwitchDialog repo={repo} folders={["legacy", "work"]} onClose={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Choose a folder to publish/);
    expect(screen.queryByRole("link", { name: "Add it on GitHub" })).toBeNull();
  });

  it("builds the workflow and links to github.com with it filled in", () => {
    render(<SwitchDialog repo={repo} folders={["legacy", "work"]} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Folder to publish"), { target: { value: "legacy" } });
    fireEvent.change(screen.getByLabelText("Person to tell"), { target: { value: "@my-sister" } });
    fireEvent.change(screen.getByLabelText("Days without writing"), { target: { value: "365" } });
    const workflow = screen.getByTestId("workflow").textContent!;
    expect(workflow).toContain('cp -R "legacy/." "docs/legacy/"');
    expect(workflow).toContain("@my-sister");
    expect(workflow).toContain(">= 365");
    const link = new URL(
      screen.getByRole("link", { name: "Add it on GitHub" }).getAttribute("href")!,
    );
    expect(link.pathname).toBe("/me/notes/new/main");
    expect(link.searchParams.get("value")).toBe(workflow);
  });

  it("refuses a username that is not one", () => {
    render(<SwitchDialog repo={repo} folders={[]} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Person to tell"), { target: { value: "a b; ls" } });
    expect(screen.getByRole("alert").textContent).toBe("That is not a GitHub username.");
  });
});
