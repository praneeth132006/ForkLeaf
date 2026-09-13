// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EncryptDialog } from "./EncryptDialog";

afterEach(cleanup);

function open(over: Partial<React.ComponentProps<typeof EncryptDialog>> = {}) {
  const props = {
    noteTitle: "Diary",
    notePath: "private/diary.md",
    onEncrypt: vi.fn(async () => {}),
    onClose: vi.fn(),
    ...over,
  };
  render(<EncryptDialog {...props} />);
  return props;
}

const [first, second] = [0, 1];
const fields = () =>
  document.querySelectorAll<HTMLInputElement>(
    'input[type="password"], input[autocomplete="new-password"]',
  );
const button = () => screen.getByRole("button", { name: "Encrypt" }) as HTMLButtonElement;

function fill(passphrase: string, confirm: string, understood = true) {
  fireEvent.change(fields()[first]!, { target: { value: passphrase } });
  fireEvent.change(fields()[second]!, { target: { value: confirm } });
  if (understood) {
    fireEvent.click(screen.getByRole("checkbox", { name: /nobody can recover/ }));
  }
}

describe("EncryptDialog", () => {
  it("says the filename is not sealed", () => {
    open();
    expect(screen.getByText("private/diary.md")).toBeTruthy();
  });

  it("waits for matching passphrases and the warning to be accepted", () => {
    open();
    expect(button().disabled).toBe(true);
    fill("river piano lantern oak", "river piano lantern oa", true);
    expect(screen.getByText("The two do not match yet.")).toBeTruthy();
    expect(button().disabled).toBe(true);
  });

  it("will not encrypt until the warning is ticked", () => {
    open();
    fill("river piano lantern oak", "river piano lantern oak", false);
    expect(button().disabled).toBe(true);
  });

  it("encrypts with the passphrase once everything is in place", async () => {
    const props = open();
    fill("river piano lantern oak", "river piano lantern oak");
    expect(button().disabled).toBe(false);
    fireEvent.click(button());
    await waitFor(() => expect(props.onEncrypt).toHaveBeenCalledWith("river piano lantern oak"));
  });

  it("advises on a weak passphrase, and can show what was typed", () => {
    open();
    fireEvent.change(fields()[first]!, { target: { value: "short" } });
    expect(screen.getByText(/12 characters/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show the passphrase" }));
    expect(document.querySelectorAll('input[type="text"]')).toHaveLength(2);
  });

  it("says so when encrypting fails", async () => {
    open({ onEncrypt: vi.fn(async () => Promise.reject(new Error("Storage is full."))) });
    fill("river piano lantern oak", "river piano lantern oak");
    fireEvent.click(button());
    expect((await screen.findByRole("alert")).textContent).toBe("Storage is full.");
  });
});
