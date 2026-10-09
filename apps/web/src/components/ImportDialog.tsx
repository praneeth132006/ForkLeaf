"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizePath } from "@forkleaf/markdown-engine";
import { Dialog } from "@/components/Dialog";
import { planImport, type ImportInput, type ImportPlan, type ImportSource } from "@/lib/importer";

/**
 * Bringing notes in from this computer.
 *
 * Markdown files first — a few `.md` files or a folder of them, picked or
 * dragged in — and Obsidian vaults and Notion exports beside them. Choose the
 * repository and the folder they go into, see what will come across (where
 * each note lands, what was left out and why), then import. Nothing is written
 * until the last step, and nothing already in the repository is replaced: a
 * name that is taken gets a number instead.
 */

export interface ImportResult {
  notes: number;
  assets: number;
  failed: { path: string; reason: string }[];
}

/** A repository the import can go into. */
export interface ImportRepository {
  id: string;
  /** What to call it, e.g. `notes`. */
  label: string;
  /** Where it is, e.g. `ada/notes · main`, or "This device only". */
  detail: string;
}

export interface ImportDialogProps {
  onClose: () => void;
  /** Every path already in the repository being imported into. */
  taken: readonly string[];
  onImport: (plan: ImportPlan) => Promise<ImportResult>;
  onOpenNote: (path: string) => void;
  /** Where to start: plain Markdown files unless a caller says otherwise. */
  initialSource?: ImportSource;
  /** The folder Markdown files go into to begin with; the top by default. */
  initialFolder?: string;
  /** Existing folders, offered as suggestions for where the notes go. */
  folders?: readonly string[];
  /** Every connected repository, and the one being imported into. */
  repositories?: readonly ImportRepository[];
  repository?: string;
  /** Switches the editor to another repository, which the import then uses. */
  onChooseRepository?: (id: string) => void;
  /**
   * False while the chosen repository's file list is still loading. An empty
   * list of taken paths means nothing until then, and importing against it
   * could give a note a name that is already in use.
   */
  ready?: boolean;
}

const SOURCES: { value: ImportSource; label: string; hint: string; folder: string | null }[] = [
  {
    value: "markdown",
    label: "Markdown files",
    hint: "Pick .md files, or a whole folder of them, from this computer. They come across exactly as written, with any pictures beside them.",
    folder: null,
  },
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

const field =
  "w-full rounded-lg border border-[var(--fl-border-strong)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]";

const label = "text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]";

/** Everything a plan depends on. A new one of these means a new plan. */
interface PlanRequest {
  inputs: ImportInput[];
  source: ImportSource;
  folder: string;
  takenKey: string;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** How many planned notes the dialog lists by name before summarising. */
const LISTED = 200;

export function ImportDialog({
  onClose,
  taken,
  onImport,
  onOpenNote,
  initialSource = "markdown",
  initialFolder = "",
  folders = [],
  repositories = [],
  repository,
  onChooseRepository,
  ready = true,
}: ImportDialogProps) {
  const folderFor = (value: ImportSource) =>
    SOURCES.find((entry) => entry.value === value)!.folder ?? initialFolder;

  const [source, setSource] = useState<ImportSource>(initialSource);
  const [destination, setDestination] = useState(() => folderFor(initialSource));
  const [inputs, setInputs] = useState<ImportInput[] | null>(null);
  /** The latest plan, with the request it answers, so a stale one is never shown. */
  const [planned, setPlanned] = useState<{ request: PlanRequest; plan: ImportPlan } | null>(null);
  const [unreadable, setUnreadable] = useState<{ request: PlanRequest; message: string } | null>(
    null,
  );
  /** The plan being, or that was, imported — fixed once the import starts. */
  const [imported, setImported] = useState<ImportPlan | null>(null);
  const [phase, setPhase] = useState<"choose" | "importing" | "done">("choose");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const folderPicker = useRef<HTMLInputElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);

  // `webkitdirectory` is not in React's attribute list, so it is set directly.
  useEffect(() => {
    folderPicker.current?.setAttribute("webkitdirectory", "");
    folderPicker.current?.setAttribute("directory", "");
  }, []);

  const folder = normalizePath(destination.trim());
  // Compared by content: a caller's array can be a new one on every render.
  const takenKey = useMemo(() => taken.join("\n"), [taken]);

  /**
   * The plan follows everything it depends on.
   *
   * Changing the folder, the source or the repository after picking files
   * re-plans rather than leaving a preview of somewhere else on screen — and
   * a repository whose file list arrives late re-plans when it does, so a name
   * already in use is never planned as free.
   *
   * Only until the import starts. The import itself adds the notes to the
   * repository's file list, and re-planning against that renamed every note
   * to make way for itself — "Open the first note" then opened one that did
   * not exist.
   */
  const request = useMemo<PlanRequest | null>(
    () => (phase === "choose" && inputs ? { inputs, source, folder, takenKey } : null),
    [phase, inputs, source, folder, takenKey],
  );

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    planImport(request.inputs, {
      source: request.source,
      destination: request.folder,
      taken: request.takenKey ? request.takenKey.split("\n") : [],
    }).then(
      (next) => {
        if (!cancelled) setPlanned({ request, plan: next });
      },
      (error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Those files could not be read.";
        setUnreadable({ request, message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request]);

  const plan =
    phase === "choose" ? (planned && planned.request === request ? planned.plan : null) : imported;
  const failedToRead = unreadable && unreadable.request === request ? unreadable.message : null;
  const reading = request !== null && plan === null && failedToRead === null;

  const chooseSource = (value: ImportSource) => {
    setSource(value);
    setDestination(folderFor(value));
    setInputs(null);
  };

  const take = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setInputs(
      [...files].map((file) => ({
        path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        file,
      })),
    );
  };

  const run = async (current: ImportPlan) => {
    setImported(current);
    setPhase("importing");
    setProblem(null);
    try {
      setResult(await onImport(current));
      setPhase("done");
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "The import did not finish.");
      setPhase("choose");
    }
  };

  const current = SOURCES.find((entry) => entry.value === source)!;
  const target = repositories.find((entry) => entry.id === repository);
  const where = folder
    ? `${target ? `${target.label}/` : ""}${folder}/`
    : `the top of ${target ? target.label : "the repository"}`;

  if (phase === "done" && result && plan) {
    return (
      <Dialog title="Import notes" subtitle="Done" onClose={onClose} wide>
        <div className="flex flex-col gap-3 text-[13px]">
          <p className="text-[var(--fl-text)]">
            Imported {plural(result.notes, "note")} and {plural(result.assets, "file")}.
          </p>
          {result.failed.length > 0 && (
            <div role="alert" className="text-[var(--fl-danger)]">
              <p>{plural(result.failed.length, "item")} could not be imported:</p>
              <ul className="mt-1 max-h-32 overflow-y-auto text-[12px]">
                {result.failed.map((entry) => (
                  <li key={entry.path}>
                    <code>{entry.path}</code> — {entry.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            {plan.notes[0] && (
              <button
                type="button"
                onClick={() => onOpenNote(plan.notes[0]!.path)}
                className="fl-btn fl-btn-primary"
              >
                Open the first note
              </button>
            )}
            <button type="button" onClick={onClose} className="fl-btn fl-btn-ghost">
              Close
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  const importing = phase === "importing";

  return (
    <Dialog
      title="Import notes"
      subtitle="Markdown files from this computer, an Obsidian vault or a Notion export"
      onClose={onClose}
      wide
    >
      <div className="flex flex-col gap-4 text-[13px]">
        <div role="radiogroup" aria-label="Import from" className="flex flex-wrap gap-2">
          {SOURCES.map((entry) => (
            <label
              key={entry.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${
                source === entry.value
                  ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
                  : "border-[var(--fl-border-strong)]"
              }`}
            >
              <input
                type="radio"
                name="import-source"
                checked={source === entry.value}
                disabled={importing}
                onChange={() => chooseSource(entry.value)}
                className="accent-[var(--fl-accent)]"
              />
              {entry.label}
            </label>
          ))}
        </div>
        <p className="-mt-1 text-[var(--fl-muted)]">{current.hint}</p>

        {/* Where the notes go: which repository, and which folder in it. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={label}>Repository</span>
            {repositories.length > 1 && onChooseRepository ? (
              <select
                value={repository}
                disabled={importing}
                onChange={(event) => onChooseRepository(event.target.value)}
                className={field}
              >
                {repositories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label} — {entry.detail}
                  </option>
                ))}
              </select>
            ) : (
              <span className={`${field} truncate text-[var(--fl-muted)]`}>
                {target ? `${target.label} — ${target.detail}` : "The open notebook"}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Folder</span>
            <input
              value={destination}
              disabled={importing}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Top of the repository"
              list="fl-import-folders"
              className={field}
            />
            <datalist id="fl-import-folders">
              {folders.map((path) => (
                <option key={path} value={path} />
              ))}
            </datalist>
          </label>
        </div>

        <input
          ref={folderPicker}
          type="file"
          multiple
          aria-label="Folder to import"
          className="hidden"
          onChange={(event) => {
            take(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={filePicker}
          type="file"
          multiple
          accept=".md,.markdown,.mdx,text/markdown"
          aria-label="Files to import"
          className="hidden"
          onChange={(event) => {
            take(event.target.files);
            event.target.value = "";
          }}
        />

        {/* The drop zone doubles as the pickers' home, so there is one obvious
            place to bring files to, whichever way they arrive. */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!importing) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (importing) return;
            void filesFromDrop(event.dataTransfer).then((dropped) => {
              if (dropped.length > 0) setInputs(dropped);
            });
          }}
          className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragging
              ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
              : "border-[var(--fl-border-strong)]"
          }`}
        >
          <p className="text-[var(--fl-text)]">
            {source === "markdown"
              ? "Drop .md files or a folder here"
              : `Drop the ${source === "obsidian" ? "vault" : "export"} folder here`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {source === "markdown" && (
              <button
                type="button"
                onClick={() => filePicker.current?.click()}
                disabled={importing}
                className="fl-btn fl-btn-primary !py-2 !text-[13px] disabled:opacity-60"
              >
                Choose files…
              </button>
            )}
            <button
              type="button"
              onClick={() => folderPicker.current?.click()}
              disabled={importing}
              className={`fl-btn !py-2 !text-[13px] disabled:opacity-60 ${
                source === "markdown" ? "fl-btn-ghost" : "fl-btn-primary"
              }`}
            >
              {source === "markdown" ? "Choose a folder…" : "Choose folder…"}
            </button>
          </div>
        </div>

        {reading && <p className="text-[var(--fl-muted)]">Reading the files…</p>}

        {plan && !reading && (
          <div className="flex flex-col gap-3">
            <p className="text-[var(--fl-text)]">
              {plural(plan.notes.length, "note")} and {plural(plan.assets.length, "file")} will be
              imported into <code>{where}</code>
              {plan.linksRewritten > 0 &&
                `, with ${plural(plan.linksRewritten, "link")} updated to match`}
              .
            </p>

            {plan.notes.length > 0 && (
              <ul
                aria-label="Where each note goes"
                className="max-h-44 overflow-y-auto rounded-lg border border-[var(--fl-border)] p-2 font-mono text-[12px]"
              >
                {plan.notes.slice(0, LISTED).map((note) => {
                  const renamed =
                    source === "markdown" && note.path !== normalizePath(`${folder}/${note.from}`);
                  return (
                    <li key={note.path} className="flex items-baseline gap-2 py-0.5">
                      <span className="truncate text-[var(--fl-text)]">{note.path}</span>
                      {renamed && (
                        <span className="shrink-0 font-sans text-[11px] text-[var(--fl-warn)]">
                          renamed — that name is taken
                        </span>
                      )}
                    </li>
                  );
                })}
                {plan.notes.length > LISTED && (
                  <li className="pt-1 font-sans text-[var(--fl-muted)]">
                    and {plural(plan.notes.length - LISTED, "more note")}
                  </li>
                )}
              </ul>
            )}

            {plan.skipped.length > 0 && (
              <details className="rounded-lg border border-[var(--fl-border)] p-2">
                <summary className="cursor-pointer text-[var(--fl-muted)]">
                  {plural(plan.skipped.length, "file")} left out
                </summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[12px]">
                  {plan.skipped.map((entry) => (
                    <li key={entry.path}>
                      <code>{entry.path}</code> — {entry.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {plan.notes.length === 0 && (
              <p className="text-[var(--fl-muted)]">There are no notes in that folder to import.</p>
            )}
            {!ready && (
              <p role="status" className="text-[var(--fl-muted)]">
                Reading what is already in this repository, so nothing is overwritten…
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={importing || !ready || plan.notes.length === 0}
                onClick={() => void run(plan)}
                className="fl-btn fl-btn-primary disabled:opacity-60"
              >
                {importing ? "Importing…" : `Import ${plural(plan.notes.length, "note")}`}
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => setInputs(null)}
                className="fl-btn fl-btn-ghost"
              >
                Start again
              </button>
            </div>
          </div>
        )}

        {(problem ?? failedToRead) && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {problem ?? failedToRead}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Everything dropped, folders walked, each with its path inside what was
 * dropped — the same shape a folder picker produces.
 */
async function filesFromDrop(transfer: DataTransfer): Promise<ImportInput[]> {
  const entries = [...transfer.items]
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);

  // A browser without the entries API still hands over plain files.
  if (entries.length === 0) {
    return [...transfer.files].map((file) => ({ path: file.name, file }));
  }

  const out: ImportInput[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      out.push({ path: `${prefix}${entry.name}`, file });
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries hands over a directory in batches; an empty one is the end.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };

  for (const entry of entries) await walk(entry, "");
  return out;
}
