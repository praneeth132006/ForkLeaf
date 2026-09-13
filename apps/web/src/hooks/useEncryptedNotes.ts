"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseDocument, serializeDocument } from "@forkleaf/markdown-engine";
import type { NoteFrontmatter } from "@forkleaf/types";
import {
  PBKDF2_ITERATIONS,
  createSession,
  isEncrypted,
  seal,
  unlock,
  type SealSession,
} from "@/lib/encryption";

/**
 * Encrypted notes, opened for as long as this tab is.
 *
 * Holds the one thing ForkLeaf never writes down: the key an encrypted note
 * was opened with, and the words it decrypted to. Both live in memory until
 * the tab closes or the note is locked, and every save seals the words again
 * before anything reaches storage.
 *
 * Its own hook rather than state in the editor, so the timers and the latest
 * text it keeps in refs stay out of the editor's render — and so the rules
 * below can be tested without mounting the whole editor.
 */

export interface OpenedNote {
  session: SealSession;
  body: string;
  frontmatter: NoteFrontmatter;
  /** The sealed versions this tab wrote, newest last. */
  envelopes: readonly string[];
}

export type WriteDocument = (
  path: string,
  content: string,
  frontmatter: NoteFrontmatter,
) => Promise<boolean>;

/** How long typing pauses before the note is sealed and written. */
export const SEAL_DELAY_MS = 400;
const KEEP_ENVELOPES = 20;

export function useEncryptedNotes(
  writeDocument: WriteDocument,
  options: { iterations?: number } = {},
) {
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const [unlocked, setUnlocked] = useState<ReadonlyMap<string, OpenedNote>>(new Map());

  const latest = useRef(unlocked);
  const write = useRef(writeDocument);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    latest.current = unlocked;
  }, [unlocked]);
  useEffect(() => {
    write.current = writeDocument;
  }, [writeDocument]);

  const remember = useCallback((path: string, entry: OpenedNote | null) => {
    setUnlocked((current) => {
      const next = new Map(current);
      if (entry) next.set(path, entry);
      else next.delete(path);
      // Kept in step immediately too, so a save that follows at once sees it.
      latest.current = next;
      return next;
    });
  }, []);

  /**
   * The note as opened, or undefined.
   *
   * Only while the file is one this tab sealed: a newer version from another
   * device locks it again rather than being overwritten by what this tab
   * remembered. Every version this tab wrote counts, not only the newest,
   * because the editor sees a save a moment before the note does.
   */
  const openedFor = useCallback(
    (note: { path: string; content: string } | null | undefined) => {
      if (!note || !isEncrypted(note.content)) return undefined;
      const entry = unlocked.get(note.path);
      return entry && entry.envelopes.includes(note.content) ? entry : undefined;
    },
    [unlocked],
  );

  const flush = useCallback(
    async (path: string) => {
      clearTimeout(timers.current.get(path));
      timers.current.delete(path);
      const entry = latest.current.get(path);
      if (!entry) return false;
      const envelope = await seal(entry.session, serializeDocument(entry.body, entry.frontmatter));
      const now = latest.current.get(path);
      if (now) {
        remember(path, { ...now, envelopes: [...now.envelopes, envelope].slice(-KEEP_ENVELOPES) });
      }
      return write.current(path, envelope, {});
    },
    [remember],
  );

  /** Typing in an open note: sealed and written after a short pause. */
  const save = useCallback(
    (path: string, body: string) => {
      const entry = latest.current.get(path);
      if (!entry) return;
      remember(path, { ...entry, body });
      clearTimeout(timers.current.get(path));
      timers.current.set(
        path,
        setTimeout(() => void flush(path), SEAL_DELAY_MS),
      );
    },
    [flush, remember],
  );

  /** Opens a sealed note. Rejects with `WrongPassphraseError` for a wrong passphrase. */
  const open = useCallback(
    async (path: string, content: string, passphrase: string) => {
      const { plaintext, session } = await unlock(content, passphrase);
      const parsed = parseDocument(plaintext);
      remember(path, {
        session,
        body: parsed.content,
        frontmatter: parsed.frontmatter,
        envelopes: [content],
      });
    },
    [remember],
  );

  /** Writes anything still waiting, then forgets the key. */
  const lock = useCallback(
    async (path: string) => {
      if (timers.current.has(path)) await flush(path);
      remember(path, null);
    },
    [flush, remember],
  );

  /**
   * Seals a plain note and writes it, keeping it open.
   *
   * Remembered before it is written, so the note stays open rather than
   * flashing the lock screen in between. Its properties go inside the seal
   * and the file keeps none of its own.
   */
  const encrypt = useCallback(
    async (path: string, body: string, frontmatter: NoteFrontmatter, passphrase: string) => {
      const session = await createSession(passphrase, iterations);
      const envelope = await seal(session, serializeDocument(body, frontmatter));
      remember(path, { session, body, frontmatter, envelopes: [envelope] });
      const written = await write.current(path, envelope, {});
      if (!written) remember(path, null);
      return written;
    },
    [iterations, remember],
  );

  /** Writes an open note back as plain text and forgets the key. */
  const decrypt = useCallback(
    async (path: string) => {
      clearTimeout(timers.current.get(path));
      timers.current.delete(path);
      const entry = latest.current.get(path);
      if (!entry) return false;
      const written = await write.current(path, entry.body, entry.frontmatter);
      if (written) remember(path, null);
      return written;
    },
    [remember],
  );

  // Anything still waiting to be sealed when the editor goes away is written,
  // not dropped.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const path of [...pending.keys()]) void flush(path);
    };
  }, [flush]);

  return useMemo(
    () => ({ openedFor, save, open, lock, encrypt, decrypt, flush }),
    [openedFor, save, open, lock, encrypt, decrypt, flush],
  );
}
