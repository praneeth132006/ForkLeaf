"use client";

import React, { useMemo } from "react";
import { diffLines, diffStats, diffWords, toHunks, type DiffLine } from "@forkleaf/markdown-engine";

export interface DiffViewProps {
  oldText: string;
  newText: string;
  /** Labels for the two sides, shown in the split header. */
  oldLabel?: string;
  newLabel?: string;
  /** Unified puts one column of changes; split shows before and after. */
  mode?: "unified" | "split";
  className?: string;
}

/**
 * A real diff, rather than two blobs of text side by side.
 *
 * Both version history and conflict resolution used to show the full old text
 * next to the full new text and leave the reader to find the change. That works
 * for a three-line note and fails for everything else, which is why this exists.
 *
 * Unchanged runs are collapsed to a few lines of context — the change is the
 * point, and burying it in an unchanged page is the thing being fixed.
 */
export function DiffView({
  oldText,
  newText,
  oldLabel = "Before",
  newLabel = "After",
  mode = "unified",
  className = "",
}: DiffViewProps) {
  const { hunks, stats, skipped } = useMemo(() => {
    const lines = diffLines(oldText, newText);
    const grouped = toHunks(lines);
    const shown = grouped.reduce((total, hunk) => total + hunk.lines.length, 0);

    return { hunks: grouped, stats: diffStats(lines), skipped: lines.length - shown };
  }, [oldText, newText]);

  if (stats.identical) {
    return (
      <p
        className={`rounded-xl border border-dashed border-[var(--fl-border)] px-6 py-10 text-center text-[13px] text-[var(--fl-muted)] ${className}`}
      >
        These two versions are identical.
      </p>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-3 text-[12px]">
        <span className="font-mono text-[var(--fl-accent)]">+{stats.added}</span>
        <span className="font-mono text-[var(--fl-danger)]">−{stats.removed}</span>
        {skipped > 0 && (
          <span className="text-[var(--fl-muted)]">
            {skipped} unchanged {skipped === 1 ? "line" : "lines"} hidden
          </span>
        )}
      </div>

      {mode === "split" && (
        <div className="mb-1 grid shrink-0 grid-cols-2 gap-px text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
          <span className="px-3">{oldLabel}</span>
          <span className="px-3">{newLabel}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--fl-border)] bg-[var(--fl-inverse-bg)] font-mono text-[12px] leading-[1.65]">
        {hunks.map((hunk, index) => (
          <section key={`${hunk.oldStart}-${hunk.newStart}-${index}`}>
            {index > 0 && (
              <p className="border-y border-[var(--fl-border)] bg-[var(--fl-elevated)]/40 px-3 py-1 text-[11px] text-[var(--fl-muted)]">
                ⋯
              </p>
            )}
            {mode === "split" ? (
              <SplitHunk lines={hunk.lines} />
            ) : (
              <UnifiedHunk lines={hunk.lines} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function UnifiedHunk({ lines }: { lines: DiffLine[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <Row key={index} line={line} />
      ))}
    </>
  );
}

function Row({ line }: { line: DiffLine }) {
  const tone =
    line.kind === "add"
      ? "bg-[var(--fl-accent)]/12"
      : line.kind === "delete"
        ? "bg-[var(--fl-danger)]/12"
        : "";

  return (
    <div className={`flex ${tone}`}>
      <span className="w-10 shrink-0 select-none px-2 text-right text-[10.5px] text-[var(--fl-muted)]">
        {line.oldNumber ?? ""}
      </span>
      <span className="w-10 shrink-0 select-none px-2 text-right text-[10.5px] text-[var(--fl-muted)]">
        {line.newNumber ?? ""}
      </span>
      <span
        aria-hidden="true"
        className={`w-4 shrink-0 select-none text-center ${
          line.kind === "add"
            ? "text-[var(--fl-accent)]"
            : line.kind === "delete"
              ? "text-[var(--fl-danger)]"
              : "text-[var(--fl-muted)]"
        }`}
      >
        {line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " "}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3 text-[var(--fl-inverse-text)]">
        {line.text || " "}
      </span>
    </div>
  );
}

/**
 * Before and after in two columns, with the differing words picked out.
 *
 * Deletions and the additions that replace them are paired up so a modified
 * line sits opposite the line it replaced, rather than the two drifting apart
 * as separate rows.
 */
function SplitHunk({ lines }: { lines: DiffLine[] }) {
  const rows: { left: DiffLine | null; right: DiffLine | null }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;

    if (line.kind === "context") {
      rows.push({ left: line, right: line });
      continue;
    }

    if (line.kind === "delete") {
      const next = lines[i + 1];
      if (next?.kind === "add") {
        rows.push({ left: line, right: next });
        i += 1;
      } else {
        rows.push({ left: line, right: null });
      }
      continue;
    }

    rows.push({ left: null, right: line });
  }

  return (
    <>
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-2 gap-px">
          <SplitCell line={row.left} counterpart={row.right} side="left" />
          <SplitCell line={row.right} counterpart={row.left} side="right" />
        </div>
      ))}
    </>
  );
}

function SplitCell({
  line,
  counterpart,
  side,
}: {
  line: DiffLine | null;
  counterpart: DiffLine | null;
  side: "left" | "right";
}) {
  // No counterpart on this side: the line exists only in the other revision.
  // Emptiness should recede rather than read as a block of content.
  if (!line) {
    return <span aria-hidden="true" className="block bg-[var(--fl-inverse-text)]/[0.04]" />;
  }

  const changed = line.kind !== "context";
  const tone = !changed
    ? ""
    : side === "left"
      ? "bg-[var(--fl-danger)]/12"
      : "bg-[var(--fl-accent)]/12";

  // Only worth a word diff when a line was replaced by another line — a pure
  // insertion has nothing to compare against.
  const paired = changed && counterpart && counterpart.kind !== "context";
  const spans = paired
    ? diffWords(
        side === "left" ? line.text : counterpart.text,
        side === "left" ? counterpart.text : line.text,
      )[side === "left" ? 0 : 1]
    : null;

  return (
    <div className={`flex ${tone}`}>
      <span className="w-9 shrink-0 select-none px-1.5 text-right text-[10.5px] text-[var(--fl-muted)]">
        {(side === "left" ? line.oldNumber : line.newNumber) ?? ""}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3 text-[var(--fl-inverse-text)]">
        {spans
          ? spans.map((span, index) =>
              span.changed ? (
                <mark
                  key={index}
                  className={`rounded-[3px] px-[1px] font-medium text-[var(--fl-inverse-text)] ${
                    side === "left" ? "bg-[var(--fl-danger)]/45" : "bg-[var(--fl-accent)]/45"
                  }`}
                >
                  {span.text}
                </mark>
              ) : (
                <span key={index}>{span.text}</span>
              ),
            )
          : line.text || " "}
      </span>
    </div>
  );
}
