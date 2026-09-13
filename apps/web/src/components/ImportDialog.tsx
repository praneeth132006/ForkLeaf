"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { planImport, type ImportPlan, type ImportSource } from "@/lib/importer";

/**
 * Importing a folder of notes from Obsidian or Notion.
 *
 * Pick the folder, see what will come across — how many notes and files, how
 * many links were fixed, what was left out and why — then import. Nothing is
 * written until the last step, and everything lands inside one folder of its
 * own, so a mistaken import is one folder to delete.
 */

export interface ImportResult {
  notes: number;
  assets: number;
  failed: { path: string; reason: string }[];
}

export interface ImportDialogProps {
  onClose: () => void;
  /** Every path already in the notebook. */
  taken: readonly string[];
  onImport: (plan: ImportPlan) => Promise<ImportResult>;
  onOpenNote: (path: string) => void;
}

const SOURCES: { value: ImportSource; label: string; hint: string; folder: string }[] = [
  {
    value: "obsidian",
    label: "Obsidian vault",
    hint: "Choose the vault's folder. Its settings and trash are left behind.",
    folder: "Imported/Obsidian",
  },
  {
    value: "notion",
    label: "Notion export",
    hint: "In Notion: Settings → Export all workspace content → Markdown & CSV. Unzip it, then choose the folder.",
    folder: "Imported/Notion",
  },
];

type Stage =
  | { kind: "choose" }
  | { kind: "reading" }
  | { kind: "planned"; plan: ImportPlan }
  | { kind: "importing"; plan: ImportPlan }
  | { kind: "done"; plan: ImportPlan; result: ImportResult };

const field =
  "w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function ImportDialog({ onClose, taken, onImport, onOpenNote }: ImportDialogProps) {
  const [source, setSource] = useState<ImportSource>("obsidian");
  const [destination, setDestination] = useState(SOURCES[0]!.folder);
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // `webkitdirectory` is not in React's attribute list, so it is set directly.
  useEffect(() => {
    picker.current?.setAttribute("webkitdirectory", "");
    picker.current?.setAttribute("directory", "");
  }, []);

  const chooseSource = (value: ImportSource) => {
    setSource(value);
    setDestination(SOURCES.find((entry) => entry.value === value)!.folder);
    setStage({ kind: "choose" });
  };

  const read = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProblem(null);
    setStage({ kind: "reading" });
    try {
      const inputs = [...files].map((file) => ({
        path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        file,
      }));
      const plan = await planImport(inputs, {
        source,
        destination: destination.trim() || "Imported",
        taken,
      });
      setStage({ kind: "planned", plan });
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "That folder could not be read.");
      setStage({ kind: "choose" });
    }
  };

  const run = async (plan: ImportPlan) => {
    setStage({ kind: "importing", plan });
    setProblem(null);
    try {
      setStage({ kind: "done", plan, result: await onImport(plan) });
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "The import did not finish.");
      setStage({ kind: "planned", plan });
    }
  };

  const current = SOURCES.find((entry) => entry.value === source)!;

  return (
    <Dialog
      title="Import notes"
      subtitle="From an Obsidian vault or a Notion export, into a folder of their own"
      onClose={onClose}
      wide
    >
      <div className="flex flex-col gap-3 text-[13px]">
        {(stage.kind === "choose" || stage.kind === "reading") && (
          <>
            <div role="radiogroup" aria-label="Import from" className="flex flex-wrap gap-2">
              {SOURCES.map((entry) => (
                <label
                  key={entry.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${
                    source === entry.value
                      ? "border-[var(--fl-accent)]"
                      : "border-[var(--fl-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="import-source"
                    checked={source === entry.value}
                    onChange={() => chooseSource(entry.value)}
                    className="accent-[var(--fl-accent)]"
                  />
                  {entry.label}
                </label>
              ))}
            </div>
            <p className="text-[var(--fl-muted)]">{current.hint}</p>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
                Import into
              </span>
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                className={field}
              />
            </label>
            <input
              ref={picker}
              type="file"
              multiple
              aria-label="Folder to import"
              className="hidden"
              onChange={(event) => void read(event.target.files)}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              disabled={stage.kind === "reading"}
              className="fl-btn fl-btn-primary self-start disabled:opacity-60"
            >
              {stage.kind === "reading" ? "Reading the folder…" : "Choose folder…"}
            </button>
          </>
        )}

        {(stage.kind === "planned" || stage.kind === "importing") && (
          <>
            <p className="text-[var(--fl-text)]">
              {plural(stage.plan.notes.length, "note")} and{" "}
              {plural(stage.plan.assets.length, "file")} will be imported into{" "}
              <code>{destination.trim() || "Imported"}/</code>
              {stage.plan.linksRewritten > 0 &&
                `, with ${plural(stage.plan.linksRewritten, "link")} updated to match`}
              .
            </p>
            {stage.plan.skipped.length > 0 && (
              <details className="rounded-lg border border-[var(--fl-border)] p-2">
                <summary className="cursor-pointer text-[var(--fl-muted)]">
                  {plural(stage.plan.skipped.length, "file")} left out
                </summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[12px]">
                  {stage.plan.skipped.map((entry) => (
                    <li key={entry.path}>
                      <code>{entry.path}</code> — {entry.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {stage.plan.notes.length === 0 && (
              <p className="text-[var(--fl-muted)]">There are no notes in that folder to import.</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStage({ kind: "choose" })}
                className="fl-btn fl-btn-ghost"
              >
                Choose a different folder
              </button>
              <button
                type="button"
                disabled={stage.kind === "importing" || stage.plan.notes.length === 0}
                onClick={() => void run(stage.plan)}
                className="fl-btn fl-btn-primary disabled:opacity-60"
              >
                {stage.kind === "importing"
                  ? "Importing…"
                  : `Import ${plural(stage.plan.notes.length, "note")}`}
              </button>
            </div>
          </>
        )}

        {stage.kind === "done" && (
          <>
            <p className="text-[var(--fl-text)]">
              Imported {plural(stage.result.notes, "note")} and{" "}
              {plural(stage.result.assets, "file")}.
            </p>
            {stage.result.failed.length > 0 && (
              <div role="alert" className="text-[var(--fl-danger)]">
                <p>{plural(stage.result.failed.length, "item")} could not be imported:</p>
                <ul className="mt-1 max-h-32 overflow-y-auto text-[12px]">
                  {stage.result.failed.map((entry) => (
                    <li key={entry.path}>
                      <code>{entry.path}</code> — {entry.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              {stage.plan.notes[0] && (
                <button
                  type="button"
                  onClick={() => onOpenNote(stage.plan.notes[0]!.path)}
                  className="fl-btn fl-btn-primary"
                >
                  Open the first note
                </button>
              )}
              <button type="button" onClick={onClose} className="fl-btn fl-btn-ghost">
                Close
              </button>
            </div>
          </>
        )}

        {problem && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
