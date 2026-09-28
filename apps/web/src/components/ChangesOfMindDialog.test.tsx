// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChangesOfMindDialog } from "./ChangesOfMindDialog";

afterEach(cleanup);

const reversal = {
  before: "We will use Postgres for the store.",
  after: "We will use SQLite for the store.",
  from: "postgres",
  to: "sqlite",
};

describe("ChangesOfMindDialog", () => {
  it("records a reason only once one is written", () => {
    const onRecord = vi.fn();
    render(
      <ChangesOfMindDialog
        reversals={[reversal]}
        onRecord={onRecord}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const save = screen.getByRole("button", { name: "Record the reason" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(`Why: ${reversal.after}`), {
      target: { value: "One file is easier to back up" },
    });
    fireEvent.click(save);
    expect(onRecord).toHaveBeenCalledWith(reversal, "One file is easier to back up");
  });

  it("puts one away without writing anything", () => {
    const onDismiss = vi.fn();
    render(
      <ChangesOfMindDialog
        reversals={[reversal]}
        onRecord={vi.fn()}
        onDismiss={onDismiss}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not a change of mind" }));
    expect(onDismiss).toHaveBeenCalledWith(reversal);
  });

  it("says so when nothing is left", () => {
    render(
      <ChangesOfMindDialog
        reversals={[]}
        onRecord={vi.fn()}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nothing left to explain/)).toBeTruthy();
  });
});
