import React, { useState } from "react";

/**
 * A text input that shows what you typed, not what the model made of it.
 *
 * Every field on the canvas edits the diagram through the Mermaid source:
 * the keystroke updates the graph, the graph is serialised to text, and the
 * text is parsed straight back into the graph the field is then re-rendered
 * from. That parse normalises — and normalising is lossy.
 *
 * A trailing space is the case that bit. Typing "Collect " serialises to
 * `n1[Collect ]`, which parses back to "Collect", so the space is gone before
 * the next letter arrives: you could type one word and never start a second.
 *
 * Rather than teach the parser to preserve half-finished input — a trailing
 * space is genuinely not meaningful in a saved diagram — the field keeps its
 * own copy of the text while it has focus. Every keystroke is still pushed
 * outwards, so the canvas, the source and the preview all stay live; only the
 * value shown belongs to the person typing. On blur the draft is dropped and
 * the model's own text takes over again.
 */
export function DraftInput({
  value,
  onValueChange,
  onBlur,
  ...rest
}: {
  value: string;
  onValueChange: (next: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  /** The in-progress text, or null when the model's value is authoritative. */
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      {...rest}
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value);
        onValueChange(event.target.value);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
}
