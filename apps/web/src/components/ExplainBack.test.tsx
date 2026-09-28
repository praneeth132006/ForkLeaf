// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExplainBack } from "./ExplainBack";

afterEach(cleanup);

const NOTE =
  "# Cells\n\nMitochondria produce energy for the cell.\n\nRibosomes build proteins from amino acids.";

describe("ExplainBack", () => {
  it("hides the note while you write, then compares side by side", () => {
    render(<ExplainBack title="Cells" content={NOTE} onClose={vi.fn()} />);
    expect(screen.queryByText(/Mitochondria produce/)).toBeNull();

    const compare = screen.getByRole("button", {
      name: /Compare with the note/,
    }) as HTMLButtonElement;
    expect(compare.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("What you remember"), {
      target: { value: "Mitochondria produce energy for the cell. The moon is made of cheese." },
    });
    fireEvent.click(compare);

    expect(screen.getByRole("status").textContent).toMatch(/You remembered \d+% of the key ideas/);
    expect(
      screen.getByText("Mitochondria produce energy for the cell.", { selector: "li" }),
    ).toBeTruthy();
    const missed = screen.getByText(/Ribosomes build proteins/).closest("li")!;
    expect(missed.getAttribute("data-status")).toBe("missed");
    expect(missed.textContent).toContain("You left out: ribosomes, build, proteins, amino, acids");
    expect(screen.getByText(/Not in the note/)).toBeTruthy();
  });

  it("lets you edit the answer, start again, or go back to the note", () => {
    const onClose = vi.fn();
    render(<ExplainBack title="Cells" content={NOTE} onClose={onClose} />);
    const area = screen.getByLabelText("What you remember");
    fireEvent.change(area, { target: { value: "Ribosomes build proteins." } });
    fireEvent.keyDown(area, { key: "Enter", metaKey: true });
    expect(screen.getByRole("status")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit my answer" }));
    expect((screen.getByLabelText("What you remember") as HTMLTextAreaElement).value).toBe(
      "Ribosomes build proteins.",
    );
    fireEvent.keyDown(screen.getByLabelText("What you remember"), { key: "Enter", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((screen.getByLabelText("What you remember") as HTMLTextAreaElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Back to the note" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ExplainBack — out loud", () => {
  function fakeRecognition() {
    const made: {
      onresult: ((event: unknown) => void) | null;
      onerror: ((event: unknown) => void) | null;
      onend: (() => void) | null;
      stop: () => void;
    }[] = [];
    class Fake {
      lang = "";
      interimResults = true;
      continuous = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn(() => this.onend?.());
      constructor() {
        made.push(this);
      }
    }
    return { Fake, made };
  }

  it("writes down what is said, and compares it like typing", () => {
    const { Fake, made } = fakeRecognition();
    render(<ExplainBack title="Cells" content={NOTE} onClose={vi.fn()} recognition={Fake} />);
    fireEvent.click(screen.getByRole("button", { name: /Say it instead/ }));
    expect(screen.getByRole("button", { name: /Listening — stop/ })).toBeTruthy();
    act(() =>
      made[0]!.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "mitochondria produce energy for the cell" } }],
      }),
    );
    expect((screen.getByLabelText("What you remember") as HTMLTextAreaElement).value).toBe(
      "Mitochondria produce energy for the cell.",
    );
    fireEvent.click(screen.getByRole("button", { name: /Listening — stop/ }));
    expect(screen.getByRole("button", { name: /Say it instead/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Compare with the note/ }));
    expect(screen.getByRole("status").textContent).toMatch(/You remembered/);
  });

  it("says when the microphone is blocked", () => {
    const { Fake, made } = fakeRecognition();
    render(<ExplainBack title="Cells" content={NOTE} onClose={vi.fn()} recognition={Fake} />);
    fireEvent.click(screen.getByRole("button", { name: /Say it instead/ }));
    act(() => {
      made[0]!.onerror?.({ error: "not-allowed" });
      made[0]!.onend?.();
    });
    expect(screen.getByRole("alert").textContent).toContain("microphone is blocked");
  });

  it("offers no microphone where the browser has no recognition", () => {
    render(<ExplainBack title="Cells" content={NOTE} onClose={vi.fn()} recognition={null} />);
    expect(screen.queryByRole("button", { name: /Say it instead/ })).toBeNull();
  });
});
