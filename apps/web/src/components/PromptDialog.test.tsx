// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptDialog, type PromptRequest } from "./PromptDialog";

afterEach(cleanup);

function open(request: Partial<PromptRequest> = {}) {
  // An override wins, and is what gets returned — otherwise a test that passes
  // its own `onConfirm` asserts against a spy the dialog never called.
  const onConfirm = request.onConfirm ? vi.fn(request.onConfirm) : vi.fn();
  const onClose = vi.fn();

  render(
    <PromptDialog
      request={{
        title: "New folder",
        label: "Folder name",
        confirmLabel: "Create",
        ...request,
        onConfirm,
      }}
      onClose={onClose}
    />,
  );

  return { onConfirm, onClose };
}

/**
 * Where the cursor lands, and what Enter does once it is there.
 *
 * `Dialog` looked for `[autofocus]` to decide what to focus, and React never
 * puts that attribute in the DOM — it calls `.focus()` itself — so the query
 * matched nothing and focus fell to the first focusable element in the panel,
 * which is the close button in the header. Two things followed: you had to
 * click into the field before you could type, and Enter dismissed the dialog
 * and discarded whatever you had typed.
 */
describe("the cursor", () => {
  it("starts in the name field, not on the close button", () => {
    open();

    const input = screen.getByLabelText("Folder name");
    expect(document.activeElement).toBe(input);
  });

  it("puts Enter on the confirm button when there is no field to type in", () => {
    open({ destructive: true, confirmLabel: "Delete", body: "Gone for good." });

    expect((document.activeElement as HTMLElement).textContent).toBe("Delete");
  });
});

describe("submitting", () => {
  it("creates on Enter, without reaching for the mouse", () => {
    const { onConfirm } = open();

    const input = screen.getByLabelText("Folder name");
    fireEvent.change(input, { target: { value: "Fieldwork" } });
    // The key itself, not a synthesised submit: the whole complaint was that
    // pressing this did nothing and Create had to be clicked.
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onConfirm).toHaveBeenCalledWith("Fieldwork", "");
  });

  it("submits once per Enter, not once per handler that hears it", () => {
    // The keydown handler asks the form to submit and cancels the browser's
    // own implicit submission. If it ever stopped cancelling, this would run
    // the confirmation twice — two commits for one folder.
    const { onConfirm } = open();

    const input = screen.getByLabelText("Folder name");
    fireEvent.change(input, { target: { value: "Fieldwork" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter on an empty name rather than creating an unnamed folder", () => {
    const { onConfirm, onClose } = open();

    fireEvent.submit(screen.getByLabelText("Folder name").closest("form")!);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not fire twice when Enter is held down", () => {
    // `onConfirm` is awaited, so a second submit can arrive while the first is
    // still in flight — which on a connected repository is two commits.
    const { onConfirm } = open({ onConfirm: vi.fn(() => new Promise<void>(() => {})) });

    const input = screen.getByLabelText("Folder name");
    fireEvent.change(input, { target: { value: "Fieldwork" } });
    const form = input.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

/**
 * Choosing a parent.
 *
 * A new folder used to land wherever the dialog happened to be opened from,
 * and saying otherwise meant typing the parent into the name with a slash —
 * spelled exactly right, or you silently got a second folder beside the one
 * you meant.
 */
describe("the parent picker", () => {
  const parent = {
    label: "Inside",
    options: ["", "Fieldwork", "Fieldwork/Soil surveys", "OSINT"],
    initial: "Fieldwork",
    rootLabel: "Repository root",
  };

  it("offers every folder in the tree, with the root named", () => {
    open({ parent });

    const options = [...screen.getByLabelText("Inside").querySelectorAll("option")];
    expect(options[0]!.textContent).toBe("Repository root");
    expect(options[0]!.getAttribute("value")).toBe("");
    expect(options.map((option) => option.getAttribute("value"))).toEqual([
      "",
      "Fieldwork",
      "Fieldwork/Soil surveys",
      "OSINT",
    ]);
  });

  it("starts on the folder the dialog was opened from", () => {
    open({ parent });

    expect((screen.getByLabelText("Inside") as HTMLSelectElement).value).toBe("Fieldwork");
  });

  it("reports the chosen parent alongside the name", () => {
    const { onConfirm } = open({ parent });

    fireEvent.change(screen.getByLabelText("Inside"), { target: { value: "OSINT" } });
    const input = screen.getByLabelText("Folder name");
    fireEvent.change(input, { target: { value: "Sources" } });
    fireEvent.submit(input.closest("form")!);

    expect(onConfirm).toHaveBeenCalledWith("Sources", "OSINT");
  });

  it("leaves the cursor in the name field, not the picker", () => {
    open({ parent });

    expect(document.activeElement).toBe(screen.getByLabelText("Folder name"));
  });
});
