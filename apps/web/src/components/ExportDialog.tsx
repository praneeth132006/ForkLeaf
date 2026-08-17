"use client";

import React, { useState } from "react";
import type { ExportFormat, Note } from "@mdnotion/types";
import {
  EXPORT_FORMATS,
  exportNote,
  printToPdf,
  downloadResult,
  exportWorkspace,
} from "@mdnotion/exporter";
import { deriveTitle } from "@mdnotion/markdown-engine";
import { Dialog } from "./Dialog";

export interface ExportDialogProps {
  note: Note;
  /** Loads every note in the workspace, for the "export everything" option. */
  loadAllNotes: () => Promise<Note[]>;
  onClose: () => void;
}

/**
 * Export.
 *
 * Everything is produced in the browser — the note is never uploaded anywhere
 * to be converted, which is both faster and means a private note stays private.
 */
export function ExportDialog({ note, loadAllNotes, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [includeFrontmatter, setIncludeFrontmatter] = useState(false);
  const [renderDiagrams, setRenderDiagrams] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = deriveTitle(note.content, note.frontmatter.title, note.path);

  const run = async (scope: "note" | "workspace") => {
    setBusy(true);
    setError(null);

    try {
      const options = { format, title, includeFrontmatter, renderDiagrams, theme };

      if (scope === "workspace") {
        // PDF and DOCX cannot be produced in bulk without a print dialog per
        // file, so bulk export offers the text-based formats.
        const bulkFormat =
          format === "pdf" || format === "docx" || format === "json" ? "md" : format;
        const notes = await loadAllNotes();
        if (notes.length === 0) throw new Error("There are no notes to export yet.");

        downloadResult(await exportWorkspace(notes, bulkFormat, options));
      } else if (format === "pdf") {
        // Goes through the browser's print pipeline so the PDF has real,
        // selectable text rather than a rasterised page.
        await printToPdf(note, options);
      } else {
        downloadResult(await exportNote(note, options));
      }

      if (format !== "pdf" || scope === "workspace") onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Export" onClose={onClose}>
      <fieldset className="mb-4">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-mist)]">
          Format
        </legend>

        <div className="grid gap-1.5 sm:grid-cols-2">
          {EXPORT_FORMATS.map((option) => (
            <label
              key={option.format}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
                format === option.format
                  ? "border-[var(--color-trail-teal)] bg-[var(--color-trail-teal)]/8"
                  : "border-[var(--color-border)] hover:border-[var(--color-mist)]"
              }`}
            >
              <input
                type="radio"
                name="format"
                value={option.format}
                checked={format === option.format}
                onChange={() => setFormat(option.format)}
                className="mt-0.5 accent-[var(--color-trail-teal)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--color-ink)]">
                  {option.label}
                </span>
                <span className="block text-xs leading-snug text-[var(--color-mist)]">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-4 space-y-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-mist)]">
          Options
        </legend>

        <Toggle
          checked={renderDiagrams}
          onChange={setRenderDiagrams}
          label="Render diagrams as images"
          hint="Otherwise they stay as Mermaid code"
        />
        <Toggle
          checked={includeFrontmatter}
          onChange={setIncludeFrontmatter}
          label="Include properties"
          hint="Writes the YAML block at the top"
        />

        {(format === "html" || format === "pdf") && (
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
            <span className="flex-1">Theme</span>
            <select
              value={theme}
              onChange={(event) => setTheme(event.target.value as "light" | "dark")}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        )}
      </fieldset>

      {format === "pdf" && (
        <p className="mb-3 rounded-md bg-[var(--color-chalk)] p-2 text-xs leading-snug text-[var(--color-mist)]">
          PDF opens your browser&apos;s print dialog — choose “Save as PDF” there. This keeps the
          text selectable and searchable.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-3 text-sm text-[var(--color-ember)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run("note")}
          className="flex-1 rounded-md bg-[var(--color-signal-amber)] px-4 py-2 text-sm font-semibold text-[var(--color-basalt)] hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Working…" : "Export this note"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run("workspace")}
          title="Download every note in this workspace as a .zip"
          className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-chalk)] disabled:opacity-50"
        >
          All notes (.zip)
        </button>
      </div>
    </Dialog>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 accent-[var(--color-trail-teal)]"
      />
      <span>
        <span className="block text-sm text-[var(--color-ink)]">{label}</span>
        <span className="block text-xs text-[var(--color-mist)]">{hint}</span>
      </span>
    </label>
  );
}
