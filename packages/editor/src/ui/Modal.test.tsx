// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "./Modal";

afterEach(cleanup);

/**
 * A modal whose `onClose` is written inline, which is how every caller writes
 * it: a new function on every render of the surrounding component. The field
 * inside re-renders the parent on each keystroke, exactly like the diagram
 * canvas does when a node is renamed.
 */
function TypingHost({ onClose = () => {} }: { onClose?: () => void }) {
  const [value, setValue] = useState("");

  return (
    <Modal title="Diagram" onClose={() => onClose()}>
      <input
        aria-label="Node label"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </Modal>
  );
}

describe("Modal", () => {
  it("leaves focus in a field being typed into", () => {
    render(<TypingHost />);

    const field = screen.getByLabelText("Node label") as HTMLInputElement;
    field.focus();

    // One character used to be the limit: the caller's new `onClose` re-ran the
    // focus-trap effect, which pulled focus back to the panel.
    for (const character of "hello") {
      expect(document.activeElement).toBe(field);
      fireEvent.change(field, { target: { value: field.value + character } });
    }

    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("hello");
  });

  it("takes focus when it opens and gives it back when it closes", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    const view = render(<TypingHost />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    view.unmount();
    expect(document.activeElement).toBe(outside);

    outside.remove();
  });

  it("gives Escape to the field being typed into before closing", () => {
    const onClose = vi.fn();
    render(<TypingHost onClose={onClose} />);

    const field = screen.getByLabelText("Node label");
    field.focus();

    // Renaming a box and changing your mind about the name must not throw away
    // the whole diagram.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    // Nothing is being typed into now, so the dialog takes the next one.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
