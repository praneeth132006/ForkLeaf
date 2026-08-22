"use client";

import { DIAGRAM_TYPES, type DiagramKind, type DiagramType } from "@forkleaf/diagrams";
import { TemplateThumbnail } from "./TemplateThumbnail";

export interface DiagramTypePickerProps {
  onPick: (kind: DiagramKind) => void;
  /** Opens the worked-example gallery instead. */
  onBrowseTemplates: () => void;
  /** Absent while the diagram is still empty, so there is nothing to go back to. */
  onCancel?: () => void;
}

/**
 * "What are you drawing?"
 *
 * The first thing a new diagram used to show was a gallery of twelve finished
 * examples — which asks you to pick a diagram before you have been asked what
 * you want to draw, and then hands you somebody else's login flow to edit into
 * your own. Editing an example into a different diagram is more work than
 * starting from nothing, so nothing is what this leads to: choose a type, get a
 * blank canvas with that type's own shapes in the palette.
 *
 * The gallery is still here, one click away, for anyone who would rather have
 * the shape handed to them.
 */
export function DiagramTypePicker({ onPick, onBrowseTemplates, onCancel }: DiagramTypePickerProps) {
  const drawable = DIAGRAM_TYPES.filter((type) => type.drawable);
  const typed = DIAGRAM_TYPES.filter((type) => !type.drawable);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--fl-text)]">
            What are you drawing?
          </h2>
          <p className="mt-0.5 text-[12.5px] text-[var(--fl-muted)]">
            You get a blank canvas with the right shapes on it. Nothing here is permanent — the type
            can be changed later.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onBrowseTemplates}
            className="rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            Start from an example
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
            >
              Back
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <Section
          label="Draw it"
          hint="Drag boxes and arrows on a canvas. The Mermaid source is written for you."
          types={drawable}
          onPick={onPick}
        />
        <Section
          label="Type it"
          hint="Charts of numbers and dates, which are quicker to write than to drag. Autocomplete and inline errors included."
          types={typed}
          onPick={onPick}
        />
      </div>
    </div>
  );
}

function Section({
  label,
  hint,
  types,
  onPick,
}: {
  label: string;
  hint: string;
  types: DiagramType[];
  onPick: (kind: DiagramKind) => void;
}) {
  if (types.length === 0) return null;

  return (
    <section className="mb-6 last:mb-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
        {label}
      </h3>
      <p className="mb-2.5 mt-0.5 text-[12px] text-[var(--fl-muted)]">{hint}</p>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((type) => (
          <button
            key={type.kind}
            type="button"
            onClick={() => onPick(type.kind)}
            className="group flex gap-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3 text-left transition-all hover:-translate-y-px hover:border-[var(--fl-accent)] hover:shadow-[var(--fl-shadow)] focus:border-[var(--fl-accent)] focus:outline-none"
          >
            <TemplateThumbnail kind={type.kind} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-[var(--fl-text)]">
                {type.title}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fl-muted)]">
                {type.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
