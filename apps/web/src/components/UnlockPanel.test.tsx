// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnlockPanel } from "./UnlockPanel";

afterEach(cleanup);

describe("UnlockPanel", () => {
  it("asks for the passphrase and unlocks with it", async () => {
    const onUnlock = vi.fn(async () => {});
    render(<UnlockPanel noteTitle="Diary" onUnlock={onUnlock} />);
    expect(screen.getByText("This note is encrypted")).toBeTruthy();
    const unlock = screen.getByRole("button", { name: "Unlock" }) as HTMLButtonElement;
    expect(unlock.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "open sesame" } });
    fireEvent.click(unlock);
    await waitFor(() => expect(onUnlock).toHaveBeenCalledWith("open sesame"));
  });

  it("shows why it could not unlock, and lets you try again", async () => {
    const onUnlock = vi.fn(async () =>
      Promise.reject(new Error("That passphrase does not open this note.")),
    );
    render(<UnlockPanel noteTitle="Diary" onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByLabelText("Passphrase").closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That passphrase does not open this note.",
    );
    expect((screen.getByRole("button", { name: "Unlock" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("never shows the sealed text", () => {
    render(<UnlockPanel noteTitle="Diary" onUnlock={vi.fn()} />);
    expect(document.body.textContent).not.toContain("forkleaf-encrypted");
  });
});
