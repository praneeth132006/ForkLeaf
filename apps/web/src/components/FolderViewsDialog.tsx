"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  NO_VALUE,
  boardFrom,
  filterRows,
  formatValue,
  inFolder,
  parseValue,
  sortRows,
  tableFrom,
  type ViewSource,
} from "@/lib/folder-views";

/**
 * A folder as a board you drag cards across, or a table you sort and edit.
 *
 * Every change is a property written into the note it belongs to, through the
 * same save as typing in the properties panel. Nothing about the board — its
 * columns, its order — is stored anywhere else: it is rebuilt from the notes
 * every time, so it cannot disagree with them.
 */

export type FolderView = "board" | "table";

export interface FolderViewsDialogProps {
  onClose: () => void;
  initialView: FolderView;
  /** Every folder in the notebook, for the picker. */
  folders: readonly string[];
  initialFolder: string;
  loadNotes: () => Promise<ViewSource[]>;
  /** Writes properties; `undefined` removes one. False when it could not. */
  onSetProperties: (path: string, changes: Record<string, unknown>) => Promise<boolean>;
  onOpenNote: (path: string) => void;
}

type Load =
  { kind: "reading" } | { kind: "done"; notes: ViewSource[] } | { kind: "error"; message: string };

const apply = (frontmatter: Record<string, unknown>, changes: Record<string, unknown>) => {
  const next = { ...frontmatter, ...changes };
  for (const [key, value] of Object.entries(changes)) if (value === undefined) delete next[key];
  return next;
};

/**
 * The React key for the column of notes without the property.
 *
 * Any string no property value would plausibly be. It used to start with a NUL
 * character, which made git and `file` treat this source as binary.
 */
const NO_VALUE_KEY = "(no value)";

const tabClass = (active: boolean) =>
  `rounded-[6px] px-2.5 py-1 text-[12px] font-medium ${
    active
      ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
      : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
  }`;

const fieldClass =
  "rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1 text-[12.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]";

export function FolderViewsDialog({
  onClose,
  initialView,
  folders,
  initialFolder,
  loadNotes,
  onSetProperties,
  onOpenNote,
}: FolderViewsDialogProps) {
  const [view, setView] = useState<FolderView>(initialView);
  const [folder, setFolder] = useState(initialFolder);
  const [load, setLoad] = useState<Load>({ kind: "reading" });
  const [problem, setProblem] = useState<string | null>(null);

  const loadRef = useRef(loadNotes);
  useEffect(() => {
    loadRef.current = loadNotes;
  }, [loadNotes]);

  useEffect(() => {
    let live = true;
    loadRef.current().then(
      (notes) => live && setLoad({ kind: "done", notes }),
      (error: unknown) =>
        live &&
        setLoad({
          kind: "error",
          message: error instanceof Error ? error.message : "Your notes could not be read.",
        }),
    );
    return () => {
      live = false;
    };
  }, []);

  const all = useMemo(() => (load.kind === "done" ? load.notes : []), [load]);
  const notes = useMemo(() => inFolder(all, folder), [all, folder]);
  const table = useMemo(() => tableFrom(notes), [notes]);

  const change = async (path: string, changes: Record<string, unknown>) => {
    setProblem(null);
    const written = await onSetProperties(path, changes);
    if (!written) {
      setProblem(`${path} could not be changed. It may be locked on this device.`);
      return;
    }
    setLoad((current) =>
      current.kind === "done"
        ? {
            kind: "done",
            notes: current.notes.map((note) =>
              note.path === path
                ? { ...note, frontmatter: apply(note.frontmatter, changes) }
                : note,
            ),
          }
        : current,
    );
  };

  return (
    <Dialog
      title={view === "board" ? "Board" : "Table"}
      subtitle="Your notes' properties, laid out — every change is written into the note"
      onClose={onClose}
      wide
      steady
    >
      <div className="flex min-h-0 flex-col gap-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="View"
            className="flex rounded-lg border border-[var(--fl-border)] p-0.5"
          >
            <button
              type="button"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              className={tabClass(view === "board")}
            >
              Board
            </button>
            <button
              type="button"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
              className={tabClass(view === "table")}
            >
              Table
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--fl-muted)]">
            Notes in
            <select
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              aria-label="Folder"
              className={fieldClass}
            >
              <option value="">the whole notebook</option>
              {folders.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[11.5px] text-[var(--fl-muted)]">
            {load.kind === "done" ? `${notes.length} note${notes.length === 1 ? "" : "s"}` : ""}
          </span>
        </div>

        {load.kind === "reading" && (
          <p role="status" className="text-[var(--fl-muted)]">
            Reading your notes…
          </p>
        )}
        {load.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {load.message}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {problem}
          </p>
        )}

        {load.kind === "done" && notes.length === 0 && (
          <p className="text-[var(--fl-muted)]">There are no notes here yet.</p>
        )}

        {load.kind === "done" && notes.length > 0 && view === "board" && (
          <Board
            notes={notes}
            properties={table.columns}
            onChange={change}
            onOpenNote={onOpenNote}
          />
        )}
        {load.kind === "done" && notes.length > 0 && view === "table" && (
          <Table
            rows={table.rows}
            columns={table.columns}
            onChange={change}
            onOpenNote={onOpenNote}
          />
        )}
      </div>
    </Dialog>
  );
}

// ── Board ────────────────────────────────────────────────────────────────

function Board({
  notes,
  properties,
  onChange,
  onOpenNote,
}: {
  notes: ViewSource[];
  properties: string[];
  onChange: (path: string, changes: Record<string, unknown>) => Promise<void>;
  onOpenNote: (path: string) => void;
}) {
  const [property, setProperty] = useState("status");
  const [extra, setExtra] = useState<string[]>([]);
  const [newColumn, setNewColumn] = useState("");
  const [over, setOver] = useState<string | null>(null);

  const columns = useMemo(() => boardFrom(notes, property, extra), [notes, property, extra]);
  const choices = useMemo(() => [...new Set(["status", ...properties])], [properties]);
  const byPath = useMemo(() => new Map(notes.map((note) => [note.path, note])), [notes]);

  const move = (path: string, value: string) => {
    const note = byPath.get(path);
    if (!note) return;
    if (formatValue(note.frontmatter[property]).trim().toLowerCase() === value.toLowerCase())
      return;
    void onChange(path, { [property]: value === NO_VALUE ? undefined : value });
  };

  const addColumn = () => {
    const name = newColumn.trim();
    if (!name) return;
    setExtra((current) => [...current, name]);
    setNewColumn("");
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--fl-muted)]">
          Columns from
          <select
            value={property}
            onChange={(event) => setProperty(event.target.value)}
            aria-label="Group by property"
            className={fieldClass}
          >
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </label>
        <form
          className="ml-auto flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            addColumn();
          }}
        >
          <input
            value={newColumn}
            onChange={(event) => setNewColumn(event.target.value)}
            placeholder="New column"
            aria-label="New column name"
            className={`${fieldClass} w-32`}
          />
          <button
            type="submit"
            className="rounded-lg border border-[var(--fl-border)] px-2 py-1 text-[12px] text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
          >
            Add
          </button>
        </form>
      </div>

      <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
        {columns.map((column) => {
          const label = column.value === NO_VALUE ? `No ${property}` : column.value;
          return (
            <section
              key={column.value || NO_VALUE_KEY}
              aria-label={label}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(column.value);
              }}
              onDragLeave={() => setOver((current) => (current === column.value ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                const path = event.dataTransfer.getData("text/plain");
                if (path) move(path, column.value);
              }}
              className={`flex w-60 shrink-0 flex-col rounded-xl border p-2 ${
                over === column.value
                  ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
                  : "border-[var(--fl-border)] bg-[var(--fl-surface)]"
              }`}
            >
              <h3 className="mb-2 flex items-center justify-between text-[12px] font-semibold text-[var(--fl-text)]">
                <span className="truncate">{label}</span>
                <span className="text-[11px] font-normal text-[var(--fl-muted)]">
                  {column.cards.length}
                </span>
              </h3>
              <ul className="min-h-[3rem] space-y-1.5 overflow-y-auto">
                {column.cards.map((card) => (
                  <li
                    key={card.path}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", card.path);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    className="cursor-grab rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-2 active:cursor-grabbing"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenNote(card.path)}
                      className="block w-full truncate text-left text-[12.5px] font-medium text-[var(--fl-text)] hover:underline"
                    >
                      {card.title}
                    </button>
                    <select
                      value={column.value}
                      aria-label={`Move ${card.title}`}
                      onChange={(event) => move(card.path, event.target.value)}
                      className="mt-1 w-full rounded border border-transparent bg-transparent text-[11px] text-[var(--fl-muted)] hover:border-[var(--fl-border)]"
                    >
                      {columns.map((target) => (
                        <option key={target.value || NO_VALUE_KEY} value={target.value}>
                          {target.value === NO_VALUE ? `No ${property}` : target.value}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────────────

function Table({
  rows,
  columns,
  onChange,
  onOpenNote,
}: {
  rows: ReturnType<typeof tableFrom>["rows"];
  columns: string[];
  onChange: (path: string, changes: Record<string, unknown>) => Promise<void>;
  onOpenNote: (path: string) => void;
}) {
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "title",
    direction: "asc",
  });
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const [newColumn, setNewColumn] = useState("");
  const [editing, setEditing] = useState<{ path: string; column: string; text: string } | null>(
    null,
  );

  const allColumns = useMemo(
    () => [...columns, ...extra.filter((name) => !columns.includes(name))],
    [columns, extra],
  );
  const shown = useMemo(
    () => sortRows(filterRows(rows, query), sort.column, sort.direction),
    [rows, query, sort],
  );

  const toggleSort = (column: string) =>
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === "asc" ? "desc" : "asc",
    }));

  const commit = () => {
    if (!editing) return;
    const row = rows.find((candidate) => candidate.path === editing.path);
    const previous = row?.values[editing.column];
    setEditing(null);
    if (!row || formatValue(previous) === editing.text.trim()) return;
    void onChange(editing.path, { [editing.column]: parseValue(editing.text, previous) });
  };

  const header = (column: string, label: string) => (
    <th
      key={column}
      scope="col"
      aria-sort={
        sort.column === column ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
      }
      className="sticky top-0 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1.5 text-left font-medium"
    >
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className="flex items-center gap-1 text-[12px] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
      >
        {label}
        {sort.column === column && (
          <span aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</span>
        )}
      </button>
    </th>
  );

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter"
          aria-label="Filter rows"
          className={`${fieldClass} w-48`}
        />
        <form
          className="ml-auto flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newColumn.trim();
            if (name && name !== "title") setExtra((current) => [...current, name]);
            setNewColumn("");
          }}
        >
          <input
            value={newColumn}
            onChange={(event) => setNewColumn(event.target.value)}
            placeholder="New property"
            aria-label="New property name"
            className={`${fieldClass} w-32`}
          />
          <button
            type="submit"
            className="rounded-lg border border-[var(--fl-border)] px-2 py-1 text-[12px] text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
          >
            Add
          </button>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--fl-border)]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {header("title", "Title")}
              {allColumns.map((column) => header(column, column))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.path} className="border-b border-[var(--fl-border)] last:border-0">
                <td className="max-w-[16rem] px-2 py-1">
                  <button
                    type="button"
                    onClick={() => onOpenNote(row.path)}
                    className="block max-w-full truncate text-left font-medium text-[var(--fl-text)] hover:underline"
                    title={row.path}
                  >
                    {row.title}
                  </button>
                </td>
                {allColumns.map((column) => {
                  const active = editing?.path === row.path && editing.column === column;
                  const text = formatValue(row.values[column]);
                  return (
                    <td key={column} className="max-w-[14rem] px-2 py-1 text-[var(--fl-text)]">
                      {active ? (
                        <input
                          autoFocus
                          value={editing.text}
                          aria-label={`${column} of ${row.title}`}
                          onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                          onBlur={commit}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commit();
                            if (event.key === "Escape") {
                              event.stopPropagation();
                              setEditing(null);
                            }
                          }}
                          className={`${fieldClass} w-full`}
                        />
                      ) : (
                        <button
                          type="button"
                          aria-label={`Edit ${column} of ${row.title}`}
                          onClick={() => setEditing({ path: row.path, column, text })}
                          className="block min-h-[1.5rem] w-full truncate rounded px-1 text-left hover:bg-[var(--fl-elevated)]"
                        >
                          {text || <span className="text-[var(--fl-muted)]">—</span>}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="p-3 text-[var(--fl-muted)]">No note matches “{query}”.</p>
        )}
      </div>
    </div>
  );
}
