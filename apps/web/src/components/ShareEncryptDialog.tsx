"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { passphraseAdvice } from "@/lib/encryption";
import {
  checkPin,
  createKey,
  openKey,
  parseKeyFile,
  readPins,
  validName,
  type Identity,
  type KeyFile,
  type PinCheck,
  type Reader,
} from "@/lib/shared-encryption";

/**
 * Encrypting a note — or a whole folder — for people.
 *
 * Three steps on one page. Your key: made once (its private half sealed under
 * your passphrase and kept in the repository so your other devices can use
 * it), or opened for this tab. The readers: anyone who has made a key in this
 * repository, you always among them. And the check that makes it safe: a
 * reader seen for the first time shows their key's fingerprint, to compare
 * with them some other way, and a reader whose key has *changed* since this
 * device last saw it is refused until that is confirmed — because anyone who
 * can write to the repository could have swapped it.
 */

export interface ShareEncryptDialogProps {
  /** This person's name — their GitHub login. */
  me: string;
  /** Names with a key in the repository. */
  known: readonly string[];
  /** The open key, if this tab has one. */
  identity: Identity | null;
  loadKey: (name: string) => Promise<string | null>;
  saveKey: (name: string, file: KeyFile) => Promise<boolean>;
  onIdentity: (identity: Identity) => void;
  /** The note being encrypted, and its folder (null at the top level). */
  noteTitle: string;
  folder: string | null;
  initialReaders?: readonly string[];
  /** Seals the note, or every note in the folder, for these readers. */
  onEncrypt: (readers: Reader[], scope: "note" | "folder") => Promise<string>;
  onClose: () => void;
}

type Loaded = { reader: Reader; pin: PinCheck } | { error: string };

export function ShareEncryptDialog({
  me,
  known,
  identity,
  loadKey,
  saveKey,
  onIdentity,
  noteTitle,
  folder,
  initialReaders = [],
  onEncrypt,
  onClose,
}: ShareEncryptDialogProps) {
  const self = me.toLowerCase();
  const [myFile, setMyFile] = useState<KeyFile | null | "reading">("reading");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set([self, ...initialReaders.map((name) => name.toLowerCase())]),
  );
  const [extra, setExtra] = useState("");
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [checked, setChecked] = useState(false);
  const [trustChanged, setTrustChanged] = useState(false);
  const [scope, setScope] = useState<"note" | "folder">("note");

  // Your own key file, once.
  useEffect(() => {
    let live = true;
    loadKey(self)
      .then((text) => (text ? parseKeyFile(text) : null))
      .then(
        (file) => live && setMyFile(file),
        () => live && setMyFile(null),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each chosen reader's key, checked against what this device saw before.
  useEffect(() => {
    let live = true;
    const pins = readPins();
    for (const name of chosen) {
      if (loaded[name]) continue;
      loadKey(name)
        .then((text) => {
          if (!text) throw new Error(`${name} has not made a key in this repository yet.`);
          return parseKeyFile(text);
        })
        .then(
          (file) => {
            const reader = {
              name: file.name,
              fingerprint: file.fingerprint,
              publicKey: file.publicKey,
            };
            if (live)
              setLoaded((current) => ({
                ...current,
                [name]: { reader, pin: checkPin(pins, reader) },
              }));
          },
          (error: unknown) => {
            if (live)
              setLoaded((current) => ({
                ...current,
                [name]: {
                  error:
                    error instanceof Error ? error.message : `${name}'s key could not be read.`,
                },
              }));
          },
        );
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  /** Your own key as a reader: just made or opened, so it is yours by definition. */
  const takeOwnKey = (file: KeyFile) =>
    setLoaded((current) => ({
      ...current,
      [self]: {
        reader: { name: file.name, fingerprint: file.fingerprint, publicKey: file.publicKey },
        pin: "same",
      },
    }));

  const entries = [...chosen].map((name) => ({ name, state: loaded[name] }));
  const readers = entries.flatMap(({ state }) =>
    state && "reader" in state ? [state.reader] : [],
  );
  const errors = entries.flatMap(({ state }) => (state && "error" in state ? [state.error] : []));
  const fresh = entries.filter(
    ({ state }) => state && "pin" in state && state.pin === "new" && state.reader.name !== self,
  );
  const changed = entries.filter(({ state }) => state && "pin" in state && state.pin === "changed");
  const allLoaded = entries.every(({ state }) => state !== undefined);
  const ready =
    identity !== null &&
    allLoaded &&
    errors.length === 0 &&
    readers.some((reader) => reader.name === self) &&
    (fresh.length === 0 || checked) &&
    (changed.length === 0 || trustChanged);

  const others = useMemo(
    () =>
      [...new Set(known.map((name) => name.toLowerCase()))].filter((name) => name !== self).sort(),
    [known, self],
  );

  const toggle = (name: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      next.add(self);
      return next;
    });

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const advice = passphraseAdvice(passphrase);
  const field = "fl-input w-full";

  return (
    <Dialog title="Encrypt for people" subtitle={noteTitle} onClose={onClose} wide>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto text-[13px]">
        {/* ── Your key ─────────────────────────────────────────────── */}
        <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3">
          <h3 className="font-semibold text-[var(--fl-text)]">Your key — {self}</h3>
          {myFile === "reading" ? (
            <p className="mt-1 text-[var(--fl-muted)]">Looking for your key…</p>
          ) : identity ? (
            <p className="mt-1 text-[var(--fl-muted)]" data-testid="my-fingerprint">
              Open for this tab. Fingerprint <code>{identity.fingerprint}</code>
            </p>
          ) : myFile ? (
            <form
              className="mt-2 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const opened = await openKey(myFile, passphrase);
                  takeOwnKey(myFile);
                  onIdentity(opened);
                });
              }}
            >
              <input
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                aria-label="Passphrase for your key"
                placeholder="Passphrase for your key"
                autoComplete="current-password"
                className={field}
              />
              <button
                type="submit"
                disabled={!passphrase || busy}
                className="fl-btn fl-btn-primary justify-self-start disabled:opacity-50"
              >
                Open my key
              </button>
            </form>
          ) : (
            <form
              className="mt-2 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const made = await createKey(self, passphrase);
                  if (!(await saveKey(self, made.file)))
                    throw new Error("Your key could not be saved.");
                  setMyFile(made.file);
                  takeOwnKey(made.file);
                  onIdentity(made.identity);
                });
              }}
            >
              <p className="text-[var(--fl-muted)]">
                You have no key in this repository yet. Its private half is sealed under the
                passphrase you choose and saved in the repository, so your other devices can open
                it. Nobody can recover it without the passphrase — not ForkLeaf, not GitHub.
              </p>
              <input
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                aria-label="New passphrase for your key"
                placeholder="A passphrase of 12 or more characters"
                autoComplete="new-password"
                className={field}
              />
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                aria-label="Passphrase again"
                placeholder="The same passphrase again"
                autoComplete="new-password"
                className={field}
              />
              {passphrase && advice && (
                <p className="text-[12px] text-[var(--fl-danger)]">{advice}</p>
              )}
              <label className="flex items-center gap-2 text-[12px] text-[var(--fl-muted)]">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(event) => setUnderstood(event.target.checked)}
                />
                I understand a forgotten passphrase means every note encrypted for me is lost to me.
              </label>
              <button
                type="submit"
                disabled={
                  busy || !passphrase || advice !== null || passphrase !== confirm || !understood
                }
                className="fl-btn fl-btn-primary justify-self-start disabled:opacity-50"
              >
                {busy ? "Making your key…" : "Make my key"}
              </button>
            </form>
          )}
        </section>

        {/* ── Readers ──────────────────────────────────────────────── */}
        <section>
          <h3 className="mb-1 font-semibold text-[var(--fl-text)]">Who can read it</h3>
          <ul className="grid gap-1.5">
            <li className="text-[var(--fl-muted)]">
              <input type="checkbox" checked disabled aria-label={`${self} (you)`} /> {self} (you)
            </li>
            {[...new Set([...others, ...[...chosen].filter((name) => name !== self)])].map(
              (name) => (
                <li key={name}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={chosen.has(name)}
                      onChange={() => toggle(name)}
                      aria-label={name}
                    />
                    {name}
                  </label>
                </li>
              ),
            )}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const name = extra.trim().replace(/^@/, "").toLowerCase();
              if (!validName(name)) return;
              setChosen((current) => new Set([...current, name]));
              setExtra("");
            }}
          >
            <input
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
              placeholder="Add someone by GitHub username"
              aria-label="Add a reader"
              className={field}
            />
            <button
              type="submit"
              disabled={!validName(extra.trim().replace(/^@/, ""))}
              className="fl-btn disabled:opacity-50"
            >
              Add
            </button>
          </form>

          {errors.map((error) => (
            <p key={error} role="alert" className="mt-2 text-[12.5px] text-[var(--fl-danger)]">
              {error} They can make one from this same dialog.
            </p>
          ))}

          {changed.length > 0 && (
            <div
              role="alert"
              className="mt-2 rounded-lg border border-[var(--fl-danger)] p-2.5 text-[12.5px] text-[var(--fl-text)]"
            >
              <p className="font-semibold text-[var(--fl-danger)]">
                The key for {changed.map(({ name }) => name).join(", ")} has changed since this
                device last used it.
              </p>
              <p className="mt-1">
                They may have made a new key — or someone with access to this repository replaced it
                to read what you encrypt. Ask them, another way, whether their fingerprint is{" "}
                {changed.map(({ name, state }) => (
                  <code key={name}>
                    {state && "reader" in state ? state.reader.fingerprint : ""}{" "}
                  </code>
                ))}
              </p>
              <label className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={trustChanged}
                  onChange={(event) => setTrustChanged(event.target.checked)}
                />
                They confirmed it is their new key
              </label>
            </div>
          )}

          {fresh.length > 0 && (
            <div className="mt-2 rounded-lg bg-[var(--fl-elevated)] p-2.5 text-[12.5px]">
              <p className="text-[var(--fl-text)]">
                First time encrypting for these people on this device. Compare fingerprints with
                them — in person, or on a call:
              </p>
              <ul className="mt-1">
                {fresh.map(({ name, state }) => (
                  <li key={name}>
                    {name}:{" "}
                    <code>{state && "reader" in state ? state.reader.fingerprint : ""}</code>
                  </li>
                ))}
              </ul>
              <label className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                />
                The fingerprints match
              </label>
            </div>
          )}
        </section>

        {folder !== null && (
          <fieldset className="grid gap-1 text-[12.5px]">
            <legend className="mb-1 font-semibold text-[var(--fl-text)]">What to encrypt</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scope === "note"}
                onChange={() => setScope("note")}
              />
              This note
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scope === "folder"}
                onChange={() => setScope("folder")}
              />
              Every note in {folder}/ — and new notes there will ask to be encrypted too
            </label>
          </fieldset>
        )}

        {problem && (
          <p role="alert" className="text-[12.5px] text-[var(--fl-danger)]">
            {problem}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() =>
              void run(async () => {
                await onEncrypt(readers, scope);
                onClose();
              })
            }
            className="fl-btn fl-btn-primary disabled:opacity-50"
          >
            Encrypt for {readers.length} {readers.length === 1 ? "person" : "people"}
          </button>
          <span className="text-[12px] text-[var(--fl-muted)]">
            Removing someone later seals the note again without them — but they may have kept what
            they could read before.
          </span>
        </div>
      </div>
    </Dialog>
  );
}
