"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Editing one diagram in a window of its own.
 *
 * The studio inside a modal is the right default — you are drawing a picture
 * *for* a paragraph, and losing sight of the paragraph is a real cost. But a
 * modal is a 92rem box on top of a note, and some diagrams are simply bigger
 * than that: an architecture map with thirty nodes wants a whole screen, a
 * second monitor, or both. So a diagram can also be opened as its own tab.
 *
 * This module is the wire between the two windows. The note tab stays the
 * owner of the text: the pop-out never writes to the repository, it posts
 * edits back, and the note applies them exactly as if they had been typed into
 * the inline studio — which means the note's own autosave, undo history and
 * dirty-state tracking all keep working, untouched. Nothing about the storage
 * path knows this feature exists.
 *
 * Two transports, because tabs are not reliable friends:
 *
 *   - `BroadcastChannel` carries the live traffic. It is instant and costs
 *     nothing per keystroke.
 *   - `localStorage` holds the session's last known text. It is what a
 *     freshly-opened pop-out reads before anyone has answered it, what a
 *     refreshed pop-out recovers from, and the reason an edit is never only in
 *     flight through an API a privacy mode might have removed.
 *
 * Both sides heartbeat, so each can tell the difference between "the other
 * window is quiet" and "the other window is gone" — a distinction that matters
 * a great deal when the answer decides whether your typing is being saved.
 */

export const DIAGRAM_CHANNEL = "forkleaf-diagram";

/** Where the pop-out route lives. Overridable for a differently-mounted app. */
export const DIAGRAM_POPOUT_PATH = "/diagram";

const STORAGE_PREFIX = "forkleaf.diagram.";

/** How often each side says it is still there. */
const HEARTBEAT_MS = 2000;
/** How long silence lasts before the other side is presumed gone. */
const STALE_MS = 6500;
/** Sessions older than this are swept: the tabs that owned them are long gone. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type DiagramPopoutMessage =
  /** Pop-out → note: I am open on this session, send me the current source. */
  | { type: "hello"; sessionId: string }
  /** Note → pop-out: this is the source, and what the note is called. */
  | { type: "state"; sessionId: string; code: string; title: string }
  /** Pop-out → note: the source changed. */
  | { type: "edit"; sessionId: string; code: string }
  /** Note → pop-out: your edit is in the note. Drives the "Saved" indicator. */
  | { type: "saved"; sessionId: string; at: number }
  /** Heartbeats, one per direction. */
  | { type: "alive"; sessionId: string }
  | { type: "host-alive"; sessionId: string }
  /** Note → pop-out: this diagram is no longer editable here (or at all). */
  | { type: "close"; sessionId: string; reason: "brought-back" | "gone" }
  /** Pop-out → note: window closing. */
  | { type: "closed"; sessionId: string };

type Listener = (message: DiagramPopoutMessage) => void;

/**
 * The channel, shared by every hook on the page.
 *
 * One `BroadcastChannel` per component would keep a channel alive per diagram
 * in a long note, and each one pins the page in memory for delivery. A browser
 * that has no such API — or has one that refuses to be constructed, which some
 * privacy modes do — gets an object whose `post` goes nowhere and whose
 * listeners simply never fire. Callers do not feature-check; the localStorage
 * half below still carries the text.
 */
class DiagramChannel {
  private channel: BroadcastChannel | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(name = DIAGRAM_CHANNEL) {
    if (typeof BroadcastChannel === "undefined") return;

    try {
      this.channel = new BroadcastChannel(name);
      this.channel.onmessage = (event: MessageEvent<DiagramPopoutMessage>) => {
        const message = event.data;
        // Another product's message on a shared name, or a newer build sending
        // something this one has never heard of.
        if (!message || typeof message.type !== "string") return;
        for (const listener of [...this.listeners]) listener(message);
      };
    } catch {
      this.channel = null;
    }
  }

  get available(): boolean {
    return this.channel !== null;
  }

  post(message: DiagramPopoutMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // A closed channel or an unclonable payload. Never worth throwing over:
      // the stored copy is the one that has to survive.
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    try {
      this.channel?.close();
    } catch {
      // Already closed.
    }
    this.channel = null;
  }
}

let shared: DiagramChannel | null = null;

function channel(): DiagramChannel {
  shared ??= new DiagramChannel();
  return shared;
}

/**
 * True when this browser can pair two windows at all.
 *
 * Without `BroadcastChannel` the note cannot hear the window, so a diagram
 * opened in one would take edits and save them nowhere. The offer is withdrawn
 * rather than made and quietly broken.
 */
export function diagramPopoutSupported(): boolean {
  return channel().available;
}

/** Drops the shared channel. Tests only. */
export function resetDiagramChannel(): void {
  shared?.close();
  shared = null;
}

// ── The stored copy ─────────────────────────────────────────────────────────

export interface DiagramSession {
  code: string;
  title: string;
  updatedAt: number;
}

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

export function readSession(sessionId: string): DiagramSession | null {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DiagramSession>;
    if (typeof parsed?.code !== "string") return null;

    return {
      code: parsed.code,
      title: typeof parsed.title === "string" ? parsed.title : "Diagram",
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeSession(sessionId: string, session: Omit<DiagramSession, "updatedAt">): void {
  try {
    window.localStorage.setItem(
      storageKey(sessionId),
      JSON.stringify({ ...session, updatedAt: Date.now() }),
    );
  } catch {
    // Full, or partitioned away. The live channel still carries the edit; only
    // the crash-recovery copy is lost.
  }
}

export function clearSession(sessionId: string): void {
  try {
    window.localStorage.removeItem(storageKey(sessionId));
  } catch {
    // Nothing to do about it, and nothing depends on it.
  }
}

/**
 * Deletes sessions whose windows are long gone.
 *
 * Without this the key space grows by one entry per diagram ever popped out,
 * each holding a copy of its source, forever.
 */
export function sweepSessions(now = Date.now()): void {
  try {
    const stale: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;

      const session = readSession(key.slice(STORAGE_PREFIX.length));
      if (!session || now - session.updatedAt > SESSION_TTL_MS) stale.push(key);
    }

    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable; there is then nothing to sweep.
  }
}

function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// ── The note's side ─────────────────────────────────────────────────────────

export interface DiagramPopoutHost {
  /** A stable id for this diagram block, for the whole time it is mounted. */
  sessionId: string;
  /** False where the two windows could not talk; callers hide the offer. */
  supported: boolean;
  /** True while a pop-out window is known to be editing this diagram. */
  active: boolean;
  /** Opens (or re-focuses) the pop-out. */
  open: () => void;
  /** Focuses an already-open pop-out, if this tab still has the handle. */
  focus: () => void;
  /** Ends the pop-out session and asks the window to close. */
  bringBack: () => void;
}

export interface DiagramPopoutHostOptions {
  code: string;
  /** Shown in the pop-out's header, so the window is identifiable. */
  title?: string;
  /** Applied to the note exactly as an inline edit would be. */
  onChange: (code: string) => void;
  /** Route the pop-out lives at. */
  path?: string;
}

/**
 * Owns a diagram on the note side.
 *
 * Deliberately inert until `open` is called: a note with forty diagrams should
 * not open forty sessions, write forty storage entries, or heartbeat about any
 * of them. Everything here starts when the user asks for a window.
 */
export function useDiagramPopoutHost({
  code,
  title = "Diagram",
  onChange,
  path = DIAGRAM_POPOUT_PATH,
}: DiagramPopoutHostOptions): DiagramPopoutHost {
  /**
   * The id, generated once and kept in a ref.
   *
   * Not `useMemo`: a memo may be recomputed whenever React feels like it, and
   * in development StrictMode's double render does exactly that — with a
   * random generator behind it, the block ended up with two ids. The window
   * was opened on one and the note kept listening on the other, so the two
   * never met and the window opened on an empty canvas. A ref is the only
   * hook that guarantees one value per mount.
   */
  const idRef = useRef<string | null>(null);
  idRef.current ??= newSessionId();
  const sessionId = idRef.current;
  const [active, setActive] = useState(false);

  // Read through refs so the subscription is set up once and never torn down
  // mid-session: callers pass `onChange` inline, and re-subscribing on every
  // keystroke would drop messages in the gap.
  const codeRef = useRef(code);
  codeRef.current = code;
  const titleRef = useRef(title);
  titleRef.current = title;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /**
   * True once this side has ended the session.
   *
   * Without it, "Edit here" was undone a second later by the window's next
   * heartbeat: the note marked the session closed, the still-open window said
   * "still here", and the badge came back — with the dialog refusing to open
   * behind it. Ending is a decision by the note, so the note stops listening
   * to that window until it opens a new one.
   */
  const ended = useRef(false);

  /**
   * True once this block has actually opened a window.
   *
   * The teardown below broadcasts "this diagram is gone". A note holding forty
   * diagrams unmounts forty blocks when it closes, and without this every one
   * of them would announce the end of a session that never existed.
   */
  const everOpened = useRef(false);

  /** The last text this side either sent or received, to avoid echoing it. */
  const mirrored = useRef(code);
  /** The source as of the last time the push effect looked at it. */
  const pushed = useRef(code);
  const lastSeen = useRef(0);
  const popout = useRef<Window | null>(null);

  const open = useCallback(() => {
    ended.current = false;
    everOpened.current = true;
    sweepSessions();
    writeSession(sessionId, { code: codeRef.current, title: titleRef.current });
    mirrored.current = codeRef.current;

    const url = `${path}?s=${encodeURIComponent(sessionId)}`;
    // A named window, so a second click on "Open in tab" focuses the window
    // that is already open rather than opening a rival editor on the same
    // diagram — which is the one way this design could lose someone's work.
    const opened = window.open(url, `forkleaf-diagram-${sessionId}`);

    if (!opened) {
      // Blocked by a pop-up blocker. Nothing has been broken — the inline
      // studio is still there — so this stays silent rather than throwing.
      clearSession(sessionId);
      return;
    }

    popout.current = opened;
    opened.focus();
    // Optimistic: the window exists, so treat the session as live until the
    // heartbeat says otherwise. Waiting for `hello` leaves the note showing
    // "not open" for the second or two the route takes to boot.
    lastSeen.current = Date.now();
    setActive(true);
  }, [path, sessionId]);

  const focus = useCallback(() => {
    try {
      popout.current?.focus();
    } catch {
      // Cross-origin or already closed; the handle is simply not usable.
    }
  }, []);

  const bringBack = useCallback(() => {
    ended.current = true;
    channel().post({ type: "close", sessionId, reason: "brought-back" });
    clearSession(sessionId);
    setActive(false);

    try {
      popout.current?.close();
    } catch {
      // A window this tab did not open cannot be closed by it. The `close`
      // message above already told it to stand down.
    }
    popout.current = null;
  }, [sessionId]);

  // Incoming traffic.
  useEffect(() => {
    const bus = channel();

    const off = bus.on((message) => {
      if (message.sessionId !== sessionId) return;
      // A window this note has already taken the diagram back from.
      if (ended.current) return;

      switch (message.type) {
        case "hello":
          lastSeen.current = Date.now();
          setActive(true);
          mirrored.current = codeRef.current;
          bus.post({
            type: "state",
            sessionId,
            code: codeRef.current,
            title: titleRef.current,
          });
          break;

        case "alive":
          lastSeen.current = Date.now();
          setActive(true);
          break;

        case "edit":
          lastSeen.current = Date.now();
          setActive(true);
          if (message.code === mirrored.current) break;
          mirrored.current = message.code;
          onChangeRef.current(message.code);
          writeSession(sessionId, { code: message.code, title: titleRef.current });
          bus.post({ type: "saved", sessionId, at: Date.now() });
          break;

        case "closed":
          setActive(false);
          popout.current = null;
          break;

        default:
          break;
      }
    });

    return off;
  }, [sessionId]);

  // Outgoing: the note changed underneath the pop-out — someone edited the
  // fence in source mode, or undid something — so the window is told.
  useEffect(() => {
    if (!active) return;

    /**
     * Only a *change* to the note's source is worth sending.
     *
     * The effect also runs when the session goes live, and at that moment the
     * window's edit has been handed to the note but the new source has not
     * come back down as a prop yet — so comparing against the mirror alone saw
     * a difference and pushed the pre-edit text back over what was just typed.
     */
    if (code === pushed.current) return;
    pushed.current = code;

    // The note has caught up to what the window already has: nothing to send,
    // and sending it would fight the caret.
    if (code === mirrored.current) return;

    mirrored.current = code;
    writeSession(sessionId, { code, title: titleRef.current });
    channel().post({ type: "state", sessionId, code, title: titleRef.current });
  }, [active, code, sessionId]);

  // Heartbeat out, watchdog in. A pop-out closed by the window manager sends
  // `closed` on the way out; one killed with the tab, or on a phone that froze
  // it, sends nothing at all, and this is what notices.
  useEffect(() => {
    if (!active) return;

    const bus = channel();
    bus.post({ type: "host-alive", sessionId });

    const timer = setInterval(() => {
      bus.post({ type: "host-alive", sessionId });

      // With no BroadcastChannel there is no heartbeat to miss, and expiring
      // the session would end the very thing that is working.
      if (!bus.available) return;
      if (Date.now() - lastSeen.current > STALE_MS) setActive(false);
    }, HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [active, sessionId]);

  // The diagram, or the note, went away while a window was still open on it.
  useEffect(() => {
    return () => {
      if (!everOpened.current) return;

      channel().post({ type: "close", sessionId, reason: "gone" });
      clearSession(sessionId);
    };
  }, [sessionId]);

  return { sessionId, supported: diagramPopoutSupported(), active, open, focus, bringBack };
}

// ── The pop-out's side ──────────────────────────────────────────────────────

/**
 * `connecting` — opened, no answer yet.
 * `linked`     — the note tab is there; edits are landing in the note.
 * `detached`   — the note tab is gone. Work continues; it is stored locally
 *                and, because it is stored, recoverable rather than lost.
 * `finished`   — the note took editing back, or the diagram no longer exists.
 */
export type DiagramLinkStatus = "connecting" | "linked" | "detached" | "finished";

export interface DiagramPopoutSession {
  code: string;
  setCode: (code: string) => void;
  title: string;
  status: DiagramLinkStatus;
  /** When the note last confirmed it had applied an edit. */
  savedAt: number | null;
  /** True between a local edit and the note's acknowledgement. */
  dirty: boolean;
  /** Why the session finished, when it has. */
  reason: "brought-back" | "gone" | null;
  /**
   * True once the source this window opened on is known.
   *
   * The studio decides what to show from the source it is *first* given — an
   * empty one means "new diagram", so it opens the type picker. The source
   * arrives a paint after mount, from storage or from the note, so mounting
   * the studio before this is true greets someone who clicked an existing
   * flowchart with "What are you drawing?".
   */
  ready: boolean;
}

/**
 * Drives the pop-out window.
 *
 * The pop-out is a *view*, not a second copy: it has no repository access and
 * writes nothing to the note directly. That is what makes this safe to leave
 * open — there is exactly one writer, so there is nothing to reconcile and no
 * way for two windows to disagree about what the diagram says.
 */
export function useDiagramPopoutSession(sessionId: string | null): DiagramPopoutSession {
  const [code, setLocalCode] = useState("");
  const [title, setTitle] = useState("Diagram");
  const [status, setStatus] = useState<DiagramLinkStatus>("connecting");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState<"brought-back" | "gone" | null>(null);
  const [ready, setReady] = useState(false);

  /** Read by the heartbeat, which must fall silent once the session is over. */
  const finished = useRef(false);

  const mirrored = useRef("");
  const lastHostSeen = useRef(0);
  /** True once anything at all has arrived, so a stale watchdog can be fair. */
  const everLinked = useRef(false);

  // Seed from storage before anyone answers. A pop-out that was refreshed —
  // or opened while the note tab was busy — shows the diagram immediately
  // instead of an empty canvas that fills in a moment later.
  useEffect(() => {
    // No session yet. `useSearchParams` reads empty on the first client pass,
    // so this is the normal state for a frame — and calling it "ready" there
    // was enough to mount the studio on an empty source, which is how someone
    // clicking an existing flowchart was asked what they wanted to draw.
    if (!sessionId) return;

    const stored = readSession(sessionId);

    if (stored) {
      setLocalCode(stored.code);
      setTitle(stored.title);
      mirrored.current = stored.code;
      setReady(true);
      return;
    }

    // Nothing stored — unusual, since the note writes the session before it
    // opens the window, but storage can be partitioned or full. Readiness then
    // waits for the note's answer, or for the link to be declared dead below.
    // Deliberately not a short timer: the note's tab is in the background by
    // the time this one has focus, and a browser throttles background tabs, so
    // "it has not answered within a second" means nothing at all.
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const bus = channel();

    // The clock starts now. Left at zero, the very first heartbeat tick found
    // "no word from the note since the epoch", declared the link dead two
    // seconds after opening, and mounted the studio on an empty source — so
    // every pop-out greeted its diagram with the new-diagram picker.
    lastHostSeen.current = Date.now();

    const off = bus.on((message) => {
      if (message.sessionId !== sessionId) return;

      switch (message.type) {
        case "state":
          lastHostSeen.current = Date.now();
          everLinked.current = true;
          setReady(true);
          setStatus("linked");
          setTitle(message.title);
          // An echo of our own text must not move the cursor or clobber a
          // keystroke typed in the gap.
          if (message.code !== mirrored.current) {
            mirrored.current = message.code;
            setLocalCode(message.code);
            setDirty(false);
          }
          break;

        case "host-alive":
          lastHostSeen.current = Date.now();
          everLinked.current = true;
          setStatus((current) => (current === "finished" ? current : "linked"));
          break;

        case "saved":
          lastHostSeen.current = Date.now();
          setSavedAt(message.at);
          setDirty(false);
          break;

        case "close":
          setReason(message.reason);
          setStatus("finished");
          setReady(true);
          // Stop announcing this window. A heartbeat after the note has taken
          // the diagram back tells it a window is still editing, which put the
          // "editing in another tab" badge straight back on the block.
          finished.current = true;
          bus.post({ type: "closed", sessionId });
          break;

        default:
          break;
      }
    });

    if (!bus.available) {
      // Nothing will ever answer. Saying "connecting" here would be a spinner
      // that resolves never, over an editor that is quietly saving nowhere.
      setStatus("finished");
      setReason("gone");
      setReady(true);
      return () => off();
    }

    bus.post({ type: "hello", sessionId });

    const timer = setInterval(() => {
      if (finished.current) return;

      bus.post({ type: "alive", sessionId });

      if (!bus.available) return;

      const silent = Date.now() - lastHostSeen.current > STALE_MS;

      // Nobody is going to send a source. Whatever is here — the stored copy,
      // or nothing — is what this window is editing, so stop waiting for it.
      if (silent) setReady(true);

      setStatus((current) => {
        if (current === "finished") return current;
        if (silent) return "detached";
        return everLinked.current ? "linked" : current;
      });
    }, HEARTBEAT_MS);

    const leaving = () => bus.post({ type: "closed", sessionId });
    // `pagehide` fires in cases `beforeunload` does not — notably a tab closed
    // on iOS Safari, and a page restored from the back/forward cache.
    window.addEventListener("pagehide", leaving);

    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leaving);
      leaving();
      off();
    };
  }, [sessionId]);

  const setCode = useCallback(
    (next: string) => {
      setLocalCode(next);
      if (!sessionId) return;

      mirrored.current = next;
      setDirty(true);
      // Stored first, posted second: if the note tab is gone, the text is
      // still somewhere it can be recovered from.
      writeSession(sessionId, { code: next, title });
      channel().post({ type: "edit", sessionId, code: next });
    },
    [sessionId, title],
  );

  return { code, setCode, title, status, savedAt, dirty, reason, ready };
}
