// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
