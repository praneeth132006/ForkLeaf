/**
 * Editing a file that lives on this machine, the way a desktop editor does.
 *
 * ForkLeaf's own storage is IndexedDB backed by a git repository, which is the
 * right model for a notebook and the wrong one for "I double-clicked a `.md`
 * file and expected an editor". The File System Access API closes that gap: a
 * `FileSystemFileHandle` is a durable reference to a real file, and writing
 * through it writes to that file — not to a copy, not to a download in
 * `~/Downloads`.
 *
 * Two ways in, and the same handle out of both:
 *
 *   - the user picks a file with `openLocalFile`
 *   - the operating system hands one over, because ForkLeaf is installed and
 *     registered as a markdown handler (see `app/manifest.ts`), and something
 *     ran `xdg-open note.md` or picked it from "Open with"
 *
 * Not supported everywhere. Firefox and Safari have no `showOpenFilePicker`,
 * so `canEditLocalFiles` is false there and the app hides the affordance
 * rather than offering something that throws — a download is still available
 * through the export dialog, which is the honest fallback.
 *
 * ## PDFs are a different kind of open
 *
 * A markdown file opened from disk becomes a note: it is text, ForkLeaf can
 * edit it, and writing through the handle writes the user's own file. A PDF is
 * none of those things. It is bytes ForkLeaf reads and cannot write, so it
 * comes back as bytes and goes to the reader rather than to the notebook — and
 * `openPdfFile` deliberately asks for read permission only, so opening a paper
 * never produces a browser prompt asking to *edit* it. An editor that requests
 * write access to a file it will never write has told the user something
 * untrue about itself.
 */

import { MAX_PDF_BYTES } from "@/lib/media";

/** True when this browser can open and write files on this machine. */
export function canEditLocalFiles(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/** True when the OS can hand this window a file it was launched with. */
export function canReceiveLaunchedFiles(): boolean {
  return typeof window !== "undefined" && "launchQueue" in window;
}

/** A text file on disk that ForkLeaf currently has open. */
export interface LocalFile {
  kind: "text";
  handle: FileSystemFileHandle;
  /** The file's own name, `meeting-notes.md`. */
  name: string;
  /** Its contents, as text. */
  text: string;
}

/** A PDF on disk that ForkLeaf currently has open. Read-only, by nature. */
export interface LocalPdf {
  kind: "pdf";
  handle: FileSystemFileHandle;
  name: string;
  /** The file's bytes, for the reader to parse. */
  bytes: Uint8Array;
}

/** Either kind of file the pickers and the operating system can hand over. */
export type LocalDocument = LocalFile | LocalPdf;

/**
 * The file types the pickers offer.
 *
 * Matches the manifest's `file_handlers`, and for the same reason: an editor
 * that appears in the OS "Open with" list for `.markdown` and then refuses to
 * open one from its own dialog is worse than one that never offered.
 */
const PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: "Markdown",
    accept: {
      "text/markdown": [".md", ".markdown", ".mdown", ".mkd", ".mdx"],
      "text/plain": [".txt", ".text"],
    },
  },
];

/** The reader's own picker. Separate, because a PDF is not a note. */
const PDF_PICKER_TYPES: FilePickerAcceptType[] = [
  { description: "PDF", accept: { "application/pdf": [".pdf"] } },
];

/** True for a name the reader should take rather than the notebook. */
export function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name);
}

/**
 * Asks the user for a file and reads it.
 *
 * Returns null when the picker is dismissed, which is a normal outcome and not
 * an error — an editor that shows "operation aborted" because somebody changed
 * their mind about opening a file is an editor telling on itself.
 */
export async function openLocalFile(): Promise<LocalFile | null> {
  if (!canEditLocalFiles()) throw new Error(UNSUPPORTED);

  let handle: FileSystemFileHandle;
  try {
    [handle] = await window.showOpenFilePicker({
      types: PICKER_TYPES,
      excludeAcceptAllOption: false,
      multiple: false,
    });
  } catch (error) {
    if (isDismissal(error)) return null;
    throw error;
  }

  return readLocalFile(handle);
}

/** Reads a handle's current contents as text. */
export async function readLocalFile(handle: FileSystemFileHandle): Promise<LocalFile> {
  const file = await handle.getFile();
  return { kind: "text", handle, name: file.name, text: await file.text() };
}

/**
 * Asks the user for a PDF and reads its bytes.
 *
 * Returns null when the picker is dismissed, exactly as `openLocalFile` does.
 */
export async function openPdfFile(): Promise<LocalPdf | null> {
  if (!canEditLocalFiles()) throw new Error(UNSUPPORTED);

  let handle: FileSystemFileHandle;
  try {
    [handle] = await window.showOpenFilePicker({
      types: PDF_PICKER_TYPES,
      excludeAcceptAllOption: false,
      multiple: false,
    });
  } catch (error) {
    if (isDismissal(error)) return null;
    throw error;
  }

  return readLocalPdf(handle);
}

/**
 * Reads a handle's bytes, refusing one too large to open.
 *
 * The size is checked before the bytes are read rather than after. Reading a
 * 600 MB file into memory in order to discover it is too big to hold in memory
 * is a way of crashing the tab that also loses whatever was unsaved in it.
 */
export async function readLocalPdf(handle: FileSystemFileHandle): Promise<LocalPdf> {
  const file = await handle.getFile();

  if (file.size > MAX_PDF_BYTES) {
    throw new Error(
      `${file.name} is ${(file.size / (1024 * 1024)).toFixed(0)} MB. ForkLeaf can open PDFs up to ${MAX_PDF_BYTES / (1024 * 1024)} MB.`,
    );
  }

  return {
    kind: "pdf",
    handle,
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

/**
 * A PDF from anywhere that is not a file handle — a drop, a paste, an `<input>`.
 *
 * Firefox and Safari have no File System Access API, so the picker above does
 * not exist there. Dragging a PDF onto the window still does, and this is what
 * makes the reader work in those browsers at all: no handle, no writing back,
 * but the document opens.
 */
export async function readDroppedPdf(file: File): Promise<Omit<LocalPdf, "handle">> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(
      `${file.name} is ${(file.size / (1024 * 1024)).toFixed(0)} MB. ForkLeaf can open PDFs up to ${MAX_PDF_BYTES / (1024 * 1024)} MB.`,
    );
  }

  return { kind: "pdf", name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/**
 * Writes text back to the file the handle points at.
 *
 * Permission is re-checked rather than assumed. A handle survives a reload —
 * and the browser's write permission does not always survive with it — so
 * writing without asking fails with a `NotAllowedError` the user has no way to
 * interpret. Asking produces the browser's own "allow ForkLeaf to edit
 * meeting-notes.md?" prompt, which is a question they can answer.
 */
export async function writeLocalFile(handle: FileSystemFileHandle, text: string): Promise<void> {
  if (!(await ensureWritable(handle))) {
    throw new Error(
      "ForkLeaf was not allowed to write to that file. Your notes are still saved here.",
    );
  }

  const writable = await handle.createWritable();
  try {
    await writable.write(text);
  } finally {
    // `close` is what actually commits the write, so it has to run even if the
    // write threw — otherwise the file is left truncated.
    await writable.close();
  }
}

/**
 * Asks where to put a new file, and writes it.
 *
 * Returns the handle so the caller can keep saving to it afterwards, which is
 * the difference between "Save as" and "Export".
 */
export async function saveLocalFileAs(
  suggestedName: string,
  text: string,
): Promise<FileSystemFileHandle | null> {
  if (!canEditLocalFiles()) throw new Error(UNSUPPORTED);

  let handle: FileSystemFileHandle;
  try {
    handle = await window.showSaveFilePicker({ suggestedName, types: PICKER_TYPES });
  } catch (error) {
    if (isDismissal(error)) return null;
    throw error;
  }

  await writeLocalFile(handle, text);
  return handle;
}

/**
 * Hands over the files this window was launched with.
 *
 * Called once per window. The launch queue delivers whatever the operating
 * system opened ForkLeaf for, and it delivers it *whenever the consumer is
 * set* — including for a launch that happened before the app finished loading,
 * which is every launch. Setting a consumer is therefore not optional: without
 * one, double-clicking a file opens ForkLeaf on an empty editor and the file
 * is silently dropped.
 */
export function consumeLaunchedFiles(onFiles: (files: LocalDocument[]) => void): void {
  if (!canReceiveLaunchedFiles()) return;

  window.launchQueue?.setConsumer((params) => {
    if (!params.files || params.files.length === 0) return;

    void (async () => {
      const opened: LocalDocument[] = [];

      for (const entry of params.files) {
        // A directory can be launched too; there is nothing to edit in one.
        if (entry.kind !== "file") continue;
        const handle = entry as FileSystemFileHandle;
        try {
          // Routed by name, because the launch queue says nothing about type.
          opened.push(
            isPdfName(handle.name) ? await readLocalPdf(handle) : await readLocalFile(handle),
          );
        } catch {
          // One unreadable file should not lose the others.
        }
      }

      if (opened.length > 0) onFiles(opened);
    })();
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const UNSUPPORTED =
  "This browser cannot open files from your computer. Chrome, Edge and other Chromium browsers can.";

/** Requests write permission if it is not already granted. */
async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const options = { mode: "readwrite" } as const;

  if ((await handle.queryPermission?.(options)) === "granted") return true;
  return (await handle.requestPermission?.(options)) === "granted";
}

/** True for the user closing a picker, which is not a failure. */
function isDismissal(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
