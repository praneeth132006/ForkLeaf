"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  canEditLocalFiles,
  consumeLaunchedFiles,
  openLocalFile,
  readLocalFile,
  saveLocalFileAs,
  writeLocalFile,
  type LocalFile,
} from "@/lib/local-files";

/**
 * Notes that are really files on this machine.
 *
 * A note ForkLeaf opened from the operating system is two things at once: a
 * note in the notebook, saved to IndexedDB like any other, and a file on disk
 * that the user expects to change when they save. This keeps the second half —
 * a handle per note path — and hands the app the actions that need it.
 *
 * The handles live for the session and no longer. `FileSystemFileHandle` is
 * structured-cloneable and could be written into IndexedDB to survive a
 * reload, but that needs a new object store, and a store needs a `DB_VERSION`
 * bump — the one change that can leave another tab unable to open the
 * database. Not worth it to save one re-open of a file.
 */

export interface LocalFilesState {
  /** False in Firefox and Safari, which have no File System Access API. */
  supported: boolean;
  /** The file name backing a note, or null for an ordinary note. */
  fileFor: (notePath: string) => string | null;
  /** Opens the picker and adopts whatever is chosen. */
  openFile: () => Promise<void>;
  /**
   * Writes a note back to its file. Returns false when it has none, so the
   * caller can fall back to "Save as" rather than reporting a failure.
   */
  saveToFile: (notePath: string, text: string) => Promise<boolean>;
  /** Picks a new file for a note, and attaches it for future saves. */
  saveFileAs: (notePath: string, suggestedName: string, text: string) => Promise<boolean>;
  /** The last thing that went wrong, for the app to show and dismiss. */
  error: string | null;
  clearError: () => void;
}

/**
 * @param adopt Puts an opened file into the notebook and returns the note path
 * it landed on, or null if it could not be taken. Called for files chosen in
 * the picker and for files the operating system launched ForkLeaf with.
 */
export function useLocalFiles(
  adopt: (file: LocalFile, existingNotePath: string | null) => Promise<string | null>,
): LocalFilesState {
  const handles = useRef(new Map<string, FileSystemFileHandle>());
  /** Mirrors the handle map's names, because a ref cannot drive a render. */
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const adoptRef = useRef(adopt);
  useEffect(() => {
    adoptRef.current = adopt;
  });

  /**
   * Finds the note already showing this exact file, if any.
   *
   * `isSameEntry` rather than comparing names: two files called `notes.md` in
   * different folders are different files, and the same file reached through
   * two handles is one file. Opening a file that is already open should focus
   * its tab, the way it does in every desktop editor — not make a second copy
   * of it in the notebook.
   */
  const findOpen = useCallback(async (handle: FileSystemFileHandle): Promise<string | null> => {
    for (const [notePath, existing] of handles.current) {
      try {
        if (await existing.isSameEntry(handle)) return notePath;
      } catch {
        // A handle whose file has gone. Treat it as not a match.
      }
    }
    return null;
  }, []);

  const take = useCallback(
    async (files: LocalFile[]) => {
      for (const file of files) {
        try {
          const already = await findOpen(file.handle);
          const notePath = await adoptRef.current(file, already);
          if (!notePath) continue;

          handles.current.set(notePath, file.handle);
          setNames((current) => ({ ...current, [notePath]: file.name }));
        } catch (problem) {
          setError(problem instanceof Error ? problem.message : "That file could not be opened.");
        }
      }
    },
    [findOpen],
  );

  // Set once per window, and set early: the launch queue delivers whatever the
  // operating system opened ForkLeaf for at the moment a consumer appears, so
  // a window that never registers one drops the file it was launched for.
  useEffect(() => {
    consumeLaunchedFiles((files) => void take(files));
  }, [take]);

  const openFile = useCallback(async () => {
    try {
      const file = await openLocalFile();
      // Null is the picker being dismissed, which is not worth reporting.
      if (file) await take([file]);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That file could not be opened.");
    }
  }, [take]);

  const saveToFile = useCallback(async (notePath: string, text: string) => {
    const handle = handles.current.get(notePath);
    if (!handle) return false;

    try {
      await writeLocalFile(handle, text);
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That file could not be saved.");
      // True even so: there *was* a file, and the caller must not go on to
      // offer "Save as" as though this note had never been opened from one.
      return true;
    }
  }, []);

  const saveFileAs = useCallback(async (notePath: string, suggestedName: string, text: string) => {
    try {
      const handle = await saveLocalFileAs(suggestedName, text);
      if (!handle) return false;

      handles.current.set(notePath, handle);
      const { name } = await readLocalFile(handle);
      setNames((current) => ({ ...current, [notePath]: name }));
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That file could not be saved.");
      return false;
    }
  }, []);

  const fileFor = useCallback((notePath: string) => names[notePath] ?? null, [names]);

  return {
    supported: canEditLocalFiles(),
    fileFor,
    openFile,
    saveToFile,
    saveFileAs,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
