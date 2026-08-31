"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SyncEngine,
  NoteRepository,
  openLocalDatabase,
  type LocalDatabase,
  type LocalDatabaseStatus,
  type RemoteGateway,
} from "@forkleaf/store";
import {
  workspaceId,
  compareTreeEntries,
  DEFAULT_SYNC_PREFERENCE,
  type LocalAsset,
  type Note,
  type NoteFrontmatter,
  type PendingChange,
  type RepoRef,
  type SyncMode,
  type SyncPreference,
  type SyncState,
  type TreeNode,
  type Workspace,
  type EditorViewMode,
} from "@forkleaf/types";
import { dirname, removeReferencesTo, serializeDocument } from "@forkleaf/markdown-engine";
import {
  GitHubGateway,
  LocalGateway,
  fetchSession,
  onSessionExpired,
  type SessionResponse,
} from "@/lib/gateway";
import {
  LOCAL_WORKSPACE,
  claimUnowned,
  collapseBranchDuplicates,
  ownedBy,
  visibleWorkspaces,
} from "@/lib/workspaces";
import { forgetLock, isPathLocked, lockedKey, renameLock, toggleLock } from "@/lib/locks";
import { assetBlob, assetFrom, assetObjectUrl, blobAsBase64, isImagePath } from "@/lib/assets";
import { entryFrom, pdfTextId } from "@/lib/pdf-index";
import { shrinkImage, ShrinkError } from "@/lib/shrink-image";
import {
  DEFAULT_TREE_ORDER,
  orderTree,
  prunedOrder,
  withCreated,
  withCreatedRenamed,
  withDropped,
  withMoved,
  withPathRenamed,
  withoutCreated,
  withoutManual,
  type CreationTimes,
  type TreeOrder,
  type TreeSortMode,
} from "@/lib/tree-order";

/**
 * The application's single source of truth.
 *
 * Owns the local database, the sync engine and the note repository, and exposes
 * them to the UI as plain state. Everything the editor does goes through here,
 * so there is exactly one place where "what happens when you type" is decided.
 */

export interface NotebookState {
  ready: boolean;
  session: SessionResponse | null;
  /**
   * True once GitHub has refused this session's token.
   *
   * Distinct from `session.mode === "local"`, which it also causes: somebody
   * who never signed in is in local mode on purpose and should be offered a
   * sign-in, while somebody whose token died was signed in a moment ago, has a
   * repository connected, and needs telling what happened to it. The same
   * "local" session with two different things worth saying about it.
   */
  sessionExpired: boolean;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  tree: TreeNode[];
  /**
   * Every note the user currently has open, in tab order. Notes stay loaded
   * when you switch between them, so moving between two files you are editing
   * together is instant and neither loses its place.
   */
  openNotes: Note[];
  /** Path of the note the editor is showing. */
  activePath: string | null;
  sync: SyncState;
  /**
   * How the active workspace is configured to push. Kept alongside the sync
   * state because the state reports the mode but not the interval, and the
   * settings UI has to show the number the user picked.
   */
  syncPreference: SyncPreference;
  error: string | null;
  /** Whether local storage is real, held by another tab, or missing entirely. */
  storage: LocalDatabaseStatus;
  /** Set while a slow operation (bootstrap, opening a note) is running. */
  busy: string | null;
  /**
   * Folders the user has made that do not hold a note yet.
   *
   * Git has no concept of an empty directory — a folder exists only because a
   * file in it does — so a freshly made folder has nowhere real to live until
   * the first note lands in it. Rather than refuse to make one, or commit a
   * placeholder file into someone's repository, they are kept here and merged
   * into the displayed tree. The moment a note is created inside, the folder
   * becomes part of the repository and drops out of this list.
   */
  emptyFolders: string[];
  /**
   * Notes kept at the top of the sidebar, in the order they were put there.
   *
   * A git repository has no file order — the tree is sorted, and any ordering
   * the app invented would either have to be written into the repository as a
   * manifest nothing else understands, or be a lie. Pinning is the honest
   * shape: the handful of notes somebody is living in right now, in an order
   * they chose, kept alongside the other per-device preferences.
   */
  pinnedPaths: string[];
  /**
   * Notes locked against editing on this device.
   *
   * A reference note is a note you read far more often than you write, and
   * reading one means clicking around in it — at which point the caret is
   * somewhere in the text and any stray keystroke is an edit that saves
   * itself, commits itself, and is discovered later as a stray character in
   * the middle of a paragraph.
   *
   * Kept per device, beside the other per-device preferences, rather than in
   * the note's frontmatter. Locking is about protecting your own hands, not a
   * property of the document — and writing it into the file would mean a
   * commit every time somebody locked or unlocked a note, which is history
   * nobody wants and a change the app made without being asked to write one.
   */
  lockedPaths: string[];
  /**
   * Folders the reader has open, in the order they were opened.
   *
   * Null until this workspace's record has been read — which is different from
   * an empty list: no record is a first visit, where the top level opens by
   * itself, and an empty list is somebody who closed everything.
   */
  expandedFolders: string[] | null;
  /**
   * The order the sidebar draws the tree in, and any folder somebody has
   * arranged by hand.
   *
   * A per-device preference like the pinned notes above it: git sorts its own
   * tree and records nothing about what anybody wanted to read first, so an
   * order kept anywhere else would have to be a manifest committed into the
   * repository that no other tool would understand.
   */
  treeOrder: TreeOrder;
  /**
   * When each note and folder was made, for the modes that sort by it.
   *
   * Only ever holds what ForkLeaf watched happen. Everything that was already
   * in a repository when it was connected has no entry here, and sorts by name
   * instead — GitHub's tree carries no creation date, and a made-up one would
   * order the notebook confidently and wrongly.
   */
  createdAt: CreationTimes;
  /**
   * True when this is a GitHub session with no repository connected yet. The
   * editor turns it into the connect dialog; the dashboard turns it into the
   * first-run repository chooser.
   */
  needsRepoChoice: boolean;
  /**
   * The last set of notes a background refresh brought down from GitHub.
   *
   * Held in state, rather than applied silently, so the editor can say what
   * changed: a note rewriting itself under the caret with no explanation is
   * alarming even when it is exactly what was asked for.
   */
  remoteChange: { paths: string[]; at: number } | null;
}

/** Keys the open set is remembered under, so a reload reopens the same tabs. */
const openTabsKey = (workspace: string) => `openNotes:${workspace}`;
const activeTabKey = (workspace: string) => `activeNote:${workspace}`;
/**
 * Sync preferences are stored per repository, not globally: "commit whenever
 * you like" is the right answer for your own notes repository and the wrong one
 * for a colleague's documentation repo, and most people have both connected.
 *
 * Keyed on the repository rather than the workspace id, which carries the
 * branch — how you want to commit is a fact about the repository, and having
 * the setting silently reset every time you moved to a branch would be a bug.
 */
const syncPrefKey = (workspace: Workspace) =>
  `syncPreference:${workspace.repo.owner}/${workspace.repo.repo}`;
/** Folders made locally that have no note in them yet. See `emptyFolders`. */
const emptyFoldersKey = (workspace: string) => `emptyFolders:${workspace}`;
const pinnedKey = (workspace: string) => `pinned:${workspace}`;
/**
 * Which folders the reader had open, in the order they opened them.
 *
 * Kept per workspace and written to disk, because a sidebar that forgets is a
 * sidebar you have to re-navigate on every visit — and the folders somebody
 * opened are a fair description of what they are working on.
 */
const expandedKey = (workspace: string) => `expanded:${workspace}`;
/** The sidebar's sort mode and any folder arranged by hand. See `treeOrder`. */
const treeOrderKey = (workspace: string) => `treeOrder:${workspace}`;
/** When each note and folder ForkLeaf made was made. See `createdAt`. */
const createdKey = (workspace: string) => `created:${workspace}`;

/**
 * Shown when the browser will not give ForkLeaf durable local storage at all.
 *
 * Deliberately does not mention other tabs: that case is recoverable and gets
 * `StorageBlocked` instead, so anyone reading this is in a private window or
 * has storage switched off, and telling them to close tabs would be a dead end.
 */
const STORAGE_UNAVAILABLE =
  "This browser will not let ForkLeaf use local storage, so nothing written here survives a reload. Leaving private browsing, or allowing site data for this page, fixes it.";

/** How many notes may be open at once, to bound memory and tab-strip width. */
const MAX_OPEN_NOTES = 12;

/**
 * How often to look for changes made somewhere else.
 *
 * A minute is short enough that a note edited on a phone is on the laptop
 * before anybody goes looking for it, and long enough to be nothing next to
 * GitHub's rate limit — 60 requests an hour per open tab, against a budget of
 * 5,000. Tabs in the background ask for nothing at all.
 */
const REMOTE_POLL_MS = 60_000;

/** What the URL asked for: a specific workspace, and a note inside it. */
export interface NotebookRequest {
  workspaceId?: string | null;
  path?: string | null;
}

export function useNotebook(request: NotebookRequest = {}) {
  // Frozen at mount: this is where the session starts from, and re-reading it
  // on every render would fight the user's own navigation between notes.
  const [requested] = useState(request);

  /**
   * The current session, for anything that needs it outside React's flow.
   *
   * The note repository is built once and lives for the session; it asks this
   * for the login to stamp on each save.
   */
  const sessionRef = useRef<SessionResponse | null>(null);

  const [state, setState] = useState<NotebookState>({
    ready: false,
    session: null,
    sessionExpired: false,
    workspaces: [],
    activeWorkspace: null,
    tree: [],
    openNotes: [],
    activePath: null,
    sync: {
      status: "idle",
      mode: DEFAULT_SYNC_PREFERENCE.mode,
      pendingCount: 0,
      blockedCount: 0,
      lastSyncedAt: null,
      lastError: null,
      lastErrorDetail: null,
      lastErrorCode: null,
      lastErrorAt: null,
      failedAttempts: 0,
      unpushed: [],
      conflicts: [],
    },
    syncPreference: DEFAULT_SYNC_PREFERENCE,
    error: null,
    storage: "ready",
    busy: null,
    emptyFolders: [],
    pinnedPaths: [],
    lockedPaths: [],
    expandedFolders: null,
    treeOrder: DEFAULT_TREE_ORDER,
    createdAt: {},
    needsRepoChoice: false,
    remoteChange: null,
  });

  // Long-lived singletons. Refs rather than state: replacing the sync engine
  // mid-session would drop the pending queue.
  const dbRef = useRef<LocalDatabase | null>(null);
  const gatewayRef = useRef<GitHubGateway | LocalGateway | null>(null);
  const syncRef = useRef<SyncEngine | null>(null);
  const repoRef = useRef<NoteRepository | null>(null);
  /** A URL-requested note is opened once, not on every workspace switch. */
  const openedRequestRef = useRef(false);
  /**
   * The current `pullRemote`, for the polling effect to call.
   *
   * That function closes over the open notes, so it is a different function on
   * every keystroke; listing it as a dependency of the interval would tear the
   * interval down and build a new one just as often, and a one-minute timer
   * that is replaced every second never fires.
   */
  const pullRef = useRef<(() => Promise<void>) | null>(null);

  const patch = useCallback((updates: Partial<NotebookState>) => {
    setState((current) => ({ ...current, ...updates }));
  }, []);

  /** Remembers the tab set so a reload comes back to the same desks. */
  const rememberTabs = useCallback((workspace: string, notes: Note[], active: string | null) => {
    void dbRef.current?.putMeta(
      openTabsKey(workspace),
      notes.map((note) => note.path),
    );
    void dbRef.current?.putMeta(activeTabKey(workspace), active);
  }, []);

  // ── Boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        /**
         * Whether the server actually answered.
         *
         * Being offline is not the same as being signed out, and the notebook
         * filter below depends on telling them apart: the cookie may be
         * perfectly valid and simply unaskable. Treating a failed request as
         * "nobody is signed in" would empty somebody's own notebook the moment
         * their train went into a tunnel, which is the opposite of what a
         * local-first app is for.
         */
        let sessionKnown = true;
        const session = await fetchSession().catch((): SessionResponse => {
          sessionKnown = false;
          return { mode: "local", user: null, githubAvailable: false };
        });
        if (cancelled) return;
        sessionRef.current = session;

        // Never throws: a browser that refuses IndexedDB gets an in-memory
        // store rather than a boot failure. Nothing typed into that store
        // survives the tab, though, so `storage` is carried into the state and
        // the editor refuses to pretend otherwise.
        const { db, status: storage } = await openLocalDatabase();
        if (storage === "blocked") {
          patch({ ready: true, busy: null, storage });
          return;
        }
        const gateway: RemoteGateway =
          session.mode === "github" ? new GitHubGateway() : new LocalGateway();

        const sync = new SyncEngine({ db, gateway });
        // Read through a ref rather than captured: signing in or out mid-
        // session must change who the next save is credited to, and a login
        // captured here would keep naming whoever opened the tab.
        const notes = new NoteRepository({
          db,
          gateway,
          sync,
          author: () => sessionRef.current?.user?.login ?? null,
        });

        dbRef.current = db;
        gatewayRef.current = gateway as GitHubGateway | LocalGateway;
        syncRef.current = sync;
        repoRef.current = notes;

        sync.subscribe((syncState) => {
          if (!cancelled) setState((current) => ({ ...current, sync: syncState }));
        });
        await sync.start();

        // Restore known workspaces, or set one up on first run.
        let workspaces = await notes.listWorkspaces();

        /**
         * Hand this browser's notebook to the account that owns it, and to
         * nobody else.
         *
         * IndexedDB belongs to a browser rather than to a person, so signing
         * out and signing in as somebody else used to leave every workspace
         * and every cached note from the previous account in place — their
         * repository names, their folders, the text of every note they had
         * opened, and an editor happy to let the new arrival type into them.
         *
         * GitHub was never exposed: each request is authorised server-side by
         * the session cookie, which is why a repository the new account cannot
         * read reported "Not Found" rather than handing over its contents. The
         * leak was the local copy — and the local copy is where the words are.
         *
         * Filtering here rather than at each screen because this is the one
         * place every workspace list starts from; a filter applied per view is
         * a filter somebody forgets to apply to the next view.
         */
        const claimedAt = await db.getMeta<number>("notebookClaimedBy");
        // Signed out on purpose hides the notebook; unable to ask falls back to
        // whoever this browser's notebook belongs to, so it still opens offline.
        const accountId = session.user?.id ?? (sessionKnown ? null : (claimedAt ?? null));

        const claimed = claimUnowned(workspaces, accountId, claimedAt != null);
        if (claimed.length > 0) {
          for (const workspace of claimed) await notes.addWorkspace(workspace);
          const byId = new Map(claimed.map((workspace) => [workspace.id, workspace]));
          workspaces = workspaces.map((workspace) => byId.get(workspace.id) ?? workspace);
        }
        if (accountId != null && claimedAt == null) {
          await db.putMeta("notebookClaimedBy", accountId);
        }

        workspaces = visibleWorkspaces(workspaces, accountId);

        if (session.mode === "github" && gateway instanceof GitHubGateway) {
          for (const workspace of workspaces) gateway.register(workspace);
        }

        // Signing in used to create a private `forkleaf-notes` repository on
        // the user's account here, with nothing asked and nothing shown. Where
        // the notes live is the user's decision, so an account with nothing
        // connected gets the on-device workspace to write in now and a repo
        // chooser — on the dashboard, or the connect dialog in the editor.
        const needsRepoChoice =
          session.mode === "github" && workspaces.every((workspace) => workspace.isLocal);

        if (workspaces.length === 0) {
          await notes.addWorkspace(LOCAL_WORKSPACE);
          workspaces = [LOCAL_WORKSPACE];
        }

        if (cancelled) return;

        // A workspace named in the URL wins — that is the dashboard handing
        // over a specific note — then whatever was open last.
        const lastId = await db.getMeta<string>("activeWorkspace");
        const active =
          (requested.workspaceId
            ? workspaces.find((w) => w.id === requested.workspaceId)
            : undefined) ??
          workspaces.find((w) => w.id === lastId) ??
          workspaces[0] ??
          null;

        /**
         * The rows earlier versions left behind, one per branch ever opened.
         *
         * Switching branches used to add a workspace and keep the old one, so
         * a repository read on three branches is listed three times under one
         * name on this device right now. Collapsed on the way in, against the
         * workspace being opened — and only where the branch being retired has
         * nothing waiting to be pushed.
         */
        const listed =
          active && !active.isLocal
            ? await collapseBranchDuplicates({
                workspaces,
                keep: active,
                notes,
                db,
                unregister: (id) => {
                  if (gateway instanceof GitHubGateway) gateway.unregister(id);
                },
              }).catch(() => workspaces)
            : workspaces;

        if (cancelled) return;

        patch({
          session,
          workspaces: listed,
          activeWorkspace: active,
          needsRepoChoice,
          ready: true,
          busy: null,
          storage,
          error: storage === "unavailable" ? STORAGE_UNAVAILABLE : null,
        });
      } catch (error) {
        if (!cancelled) {
          patch({
            ready: true,
            busy: null,
            error: error instanceof Error ? error.message : "Could not start ForkLeaf.",
          });
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
    // `requested` is frozen at mount, so this still runs exactly once.
  }, [patch, requested.workspaceId]);

  // ── The sign-in ending underneath us ────────────────────────────────────
  /**
   * A session cookie outlives the GitHub token inside it, and nothing says so.
   *
   * The token can be refused at any moment — the authorisation revoked, the
   * same OAuth app signed into again elsewhere at a different access level,
   * GitHub retiring it. The cookie is good for thirty days regardless, so the
   * app went on showing an avatar, a repository and a sync indicator while
   * every single call behind them came back 401. What the reader saw was a
   * note whose nine screenshots had all turned into broken boxes, and nothing
   * anywhere to say why. It read as the app having eaten their images.
   *
   * The server drops the cookie the moment GitHub refuses it. This is that
   * fact arriving on the page: stop claiming to be signed in, and say so once,
   * in words. Notes and unpushed changes are untouched — they are on this
   * device, they stay on this device, and signing in again resumes pushing
   * them.
   */
  useEffect(
    () =>
      onSessionExpired(() => {
        const signedOut: SessionResponse = {
          mode: "local",
          user: null,
          githubAvailable: true,
          scopes: [],
        };
        // The note repository reads this ref for the login to stamp on a save.
        // We no longer know who that is, and guessing would credit somebody's
        // notes to a session GitHub has already thrown away.
        sessionRef.current = signedOut;
        setState((current) =>
          current.sessionExpired
            ? current
            : { ...current, session: signedOut, sessionExpired: true },
        );
      }),
    [],
  );

  // ── Load the tree whenever the workspace changes ────────────────────────
  useEffect(() => {
    const workspace = state.activeWorkspace;
    const notes = repoRef.current;
    if (!workspace || !notes) return;

    let cancelled = false;

    const load = async () => {
      await dbRef.current?.putMeta("activeWorkspace", workspace.id);
      await notes.touchWorkspace(workspace.id);

      // The engine outlives the workspace switch, so its mode has to be reset
      // to this workspace's choice — otherwise the manual mode you set on a
      // colleague's repo silently follows you into your own notes.
      const preference =
        (await dbRef.current?.getMeta<SyncPreference>(syncPrefKey(workspace))) ??
        DEFAULT_SYNC_PREFERENCE;

      if (!cancelled) {
        syncRef.current?.setMode(preference.mode, preference.intervalMinutes);
        patch({ syncPreference: preference });
      }

      // Rescue anything a previous version stranded.
      //
      // The sync engine used to delete a change from its queue after five
      // failed pushes, leaving the note marked dirty with nothing that would
      // ever push it — and an empty queue reporting "All changes saved". The
      // discard is gone, but that does nothing for notes already stranded on
      // this device, which are the ones with writing in them. Every dirty note
      // with no queue entry is put back in the queue on load.
      if (!workspace.isLocal) {
        void syncRef.current?.recoverStrandedEdits(workspace.id, (note) =>
          serializeDocument(note.content, note.frontmatter),
        );
        // The same for images. They were pushed outside the queue for a long
        // time, so a failed upload left the file here and nothing anywhere
        // that remembered it still had somewhere to be.
        void syncRef.current?.recoverStrandedAssets(workspace.id);
      }

      const folders = (await dbRef.current?.getMeta<string[]>(emptyFoldersKey(workspace.id))) ?? [];
      if (!cancelled) patch({ emptyFolders: folders });

      const pinned = (await dbRef.current?.getMeta<string[]>(pinnedKey(workspace.id))) ?? [];
      if (!cancelled) patch({ pinnedPaths: pinned });

      const locked = (await dbRef.current?.getMeta<string[]>(lockedKey(workspace.id))) ?? [];
      if (!cancelled) patch({ lockedPaths: locked });

      const expanded = await dbRef.current?.getMeta<string[]>(expandedKey(workspace.id));
      // No record at all is a first visit, not a deliberate "all closed" — the
      // top level opens, as it always did.
      if (!cancelled) patch({ expandedFolders: expanded ?? null });

      // Per workspace, because how you want to read a course numbered 1 to 10
      // and how you want to read a colleague's documentation repo are not the
      // same question.
      const order = await dbRef.current?.getMeta<TreeOrder>(treeOrderKey(workspace.id));
      const created =
        (await dbRef.current?.getMeta<Record<string, string>>(createdKey(workspace.id))) ?? {};
      if (!cancelled) {
        patch({
          treeOrder: order ? { ...DEFAULT_TREE_ORDER, ...order } : DEFAULT_TREE_ORDER,
          createdAt: created,
        });
      }

      // Reopen the tabs this workspace had last time, plus whatever the URL
      // asked for. A note that has since been deleted simply fails to load and
      // is left out.
      const remembered = (await dbRef.current?.getMeta<string[]>(openTabsKey(workspace.id))) ?? [];
      const rememberedActive = await dbRef.current?.getMeta<string>(activeTabKey(workspace.id));

      // Only for the workspace the link named — otherwise switching workspaces
      // later in the session would keep dragging the same note along.
      const wanted =
        requested.path &&
        (!requested.workspaceId || requested.workspaceId === workspace.id) &&
        !openedRequestRef.current
          ? requested.path
          : null;
      if (wanted) openedRequestRef.current = true;

      const toOpen = wanted
        ? [wanted, ...remembered.filter((path) => path !== wanted)]
        : remembered;

      if (toOpen.length > 0 && !cancelled) {
        const restored = (
          await Promise.all(
            toOpen
              .slice(0, MAX_OPEN_NOTES)
              .map((path) => notes.openNote(workspace.id, path).catch(() => null)),
          )
        ).filter((note): note is Note => note !== null);

        if (!cancelled && restored.length > 0) {
          const active =
            (wanted ? restored.find((note) => note.path === wanted) : undefined) ??
            restored.find((note) => note.path === rememberedActive) ??
            restored[0];

          patch({ openNotes: restored, activePath: active?.path ?? null });
          rememberTabs(workspace.id, restored, active?.path ?? null);
        }
      }

      if (workspace.isLocal) {
        // Local mode has no remote tree; build one from what is stored.
        const localNotes = await notes.listNotes(workspace.id);
        if (!cancelled) patch({ tree: treeFromPaths(localNotes.map((note) => note.path)) });
        return;
      }

      const tree = await notes.getTree(workspace.id, (fresh) => {
        if (!cancelled) patch({ tree: fresh });
      });
      if (!cancelled) patch({ tree });
    };

    void load().catch((error) => {
      if (!cancelled) patch({ error: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      cancelled = true;
    };
  }, [state.activeWorkspace, requested.path, requested.workspaceId, patch, rememberTabs]);

  // ── Flush pending changes when the connection returns ───────────────────
  useEffect(() => {
    // retryNow rather than flushNow: a reconnect should also clear any backoff
    // the engine built up while the network was down.
    const onOnline = () => syncRef.current?.retryNow();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // ── Bring down what other people changed ────────────────────────────────
  /**
   * On a timer, and whenever the tab comes back to the front.
   *
   * The timer catches a colleague committing while you read; coming back to
   * the tab is the moment somebody has most likely been editing the same
   * notebook somewhere else — on their phone, on github.com, in another
   * window — and it is also the cheapest possible trigger, because a tab
   * nobody is looking at asks GitHub for nothing at all.
   *
   * Manual sync means manual: somebody who has turned off automatic pushing
   * has said they want the network left alone, and quietly polling it every
   * minute would be a strange reading of that.
   */
  useEffect(() => {
    const workspace = state.activeWorkspace;
    if (!workspace || workspace.isLocal) return;
    if (state.syncPreference.mode === "manual") return;

    const pull = () => {
      if (document.visibilityState !== "visible") return;
      void pullRef.current?.();
    };

    const timer = window.setInterval(pull, REMOTE_POLL_MS);
    window.addEventListener("visibilitychange", pull);
    window.addEventListener("focus", pull);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("visibilitychange", pull);
      window.removeEventListener("focus", pull);
    };
    // Deliberately not depending on `pullRemote` itself, which changes
    // whenever an open note does: rebuilding the interval on every keystroke
    // would mean it never fired.
  }, [state.activeWorkspace, state.syncPreference.mode]);

  // ── Warn before closing with unsaved work ───────────────────────────────
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (state.sync.pendingCount === 0) return;
      // Changes are safe in IndexedDB either way; this just tells the user
      // their latest edits have not reached GitHub yet.
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.sync.pendingCount]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const openNote = useCallback(
    async (path: string) => {
      const workspace = state.activeWorkspace;
      const notes = repoRef.current;
      if (!workspace || !notes) return;

      // Already open: this is a tab switch, which should be instant and must
      // not throw away unsaved-to-remote edits by re-reading from storage.
      if (state.openNotes.some((note) => note.path === path)) {
        patch({ activePath: path });
        rememberTabs(workspace.id, state.openNotes, path);
        return;
      }

      patch({ busy: "Opening…", error: null });
      try {
        const note = await notes.openNote(workspace.id, path);
        // Past the cap, the least recently used tab gives way rather than the
        // strip growing until the labels are unreadable.
        const next = [...state.openNotes, note].slice(-MAX_OPEN_NOTES);

        patch({ openNotes: next, activePath: note.path, busy: null });
        rememberTabs(workspace.id, next, note.path);
      } catch (error) {
        patch({
          busy: null,
          error: error instanceof Error ? error.message : "Could not open that note.",
        });
      }
    },
    [state.activeWorkspace, state.openNotes, patch, rememberTabs],
  );

  /**
   * Closes one tab.
   *
   * Nothing is discarded: the note is already saved locally, and its pending
   * changes stay queued for sync. Closing only takes it off the strip.
   */
  const closeNote = useCallback(
    (path: string) => {
      const workspace = state.activeWorkspace;
      const remaining = state.openNotes.filter((note) => note.path !== path);

      // Focus moves to the neighbour on the left, which is where the eye
      // already is after closing something.
      const closedAt = state.openNotes.findIndex((note) => note.path === path);
      const activePath =
        state.activePath === path
          ? (remaining[Math.max(0, closedAt - 1)]?.path ?? null)
          : state.activePath;

      patch({ openNotes: remaining, activePath });
      if (workspace) rememberTabs(workspace.id, remaining, activePath);
    },
    [state.activeWorkspace, state.openNotes, state.activePath, patch, rememberTabs],
  );

  /**
   * Loads a note without making it the active one.
   *
   * Rename and delete need the note's base SHA and content even when the user
   * acted on it from the sidebar without opening it.
   */
  const openNoteAndReturn = useCallback(
    async (path: string): Promise<Note | null> => {
      const workspace = state.activeWorkspace;
      const notes = repoRef.current;
      if (!workspace || !notes) return null;

      try {
        return await notes.openNote(workspace.id, path);
      } catch (error) {
        patch({ error: error instanceof Error ? error.message : "Could not load that note." });
        return null;
      }
    },
    [state.activeWorkspace, patch],
  );

  const activeNote = useMemo(
    () => state.openNotes.find((note) => note.path === state.activePath) ?? null,
    [state.openNotes, state.activePath],
  );

  /** Replaces one open note in place, leaving the rest of the tabs untouched. */
  const patchOpenNote = useCallback((path: string, changes: Partial<Note>) => {
    setState((previous) => ({
      ...previous,
      openNotes: previous.openNotes.map((note) =>
        note.path === path ? { ...note, ...changes } : note,
      ),
    }));
  }, []);

  /**
   * The last line of defence for a locked note.
   *
   * The editing surfaces are made read-only when a note is locked, which is
   * what stops the keystrokes. This is here because "read-only" is a property
   * of four different surfaces plus a paste handler plus a drop handler plus a
   * toolbar, and a lock that holds only as long as every one of them remembers
   * to check is not a lock. Everything that writes a note's content goes
   * through here.
   */
  const isLocked = useCallback(
    (path: string | null | undefined) => isPathLocked(state.lockedPaths, path),
    [state.lockedPaths],
  );

  const putLocked = useCallback(
    (next: string[]) => {
      const workspace = state.activeWorkspace;
      patch({ lockedPaths: next });
      if (workspace) void dbRef.current?.putMeta(lockedKey(workspace.id), next);
    },
    [state.activeWorkspace, patch],
  );

  const toggleLocked = useCallback(
    (path: string) => putLocked(toggleLock(state.lockedPaths, path)),
    [state.lockedPaths, putLocked],
  );

  const saveNote = useCallback(
    async (content: string) => {
      const notes = repoRef.current;
      if (!notes || !activeNote) return;
      if (isLocked(activeNote.path)) return;

      // Optimistic: show the new content immediately, persist in the background.
      patchOpenNote(activeNote.path, { content, dirty: true });
      await notes.saveNote(activeNote, content);
    },
    [activeNote, patchOpenNote, isLocked],
  );

  /**
   * Replaces the content of a note by path, active or not.
   *
   * `saveNote` only ever writes the note the editor is showing, which is right
   * for typing and wrong for the one case where content arrives from outside:
   * a file re-read from this machine belongs to whichever tab holds it, not to
   * whichever tab happens to be in front.
   */
  const replaceNoteContent = useCallback(
    async (path: string, content: string) => {
      const notes = repoRef.current;
      const target = state.openNotes.find((note) => note.path === path);
      if (!notes || !target || target.content === content) return;
      if (isLocked(path)) return;

      patchOpenNote(path, { content, dirty: true });
      await notes.saveNote(target, content);
    },
    [state.openNotes, patchOpenNote, isLocked],
  );

  const updateFrontmatter = useCallback(
    async (frontmatter: Note["frontmatter"]) => {
      const notes = repoRef.current;
      if (!notes || !activeNote) return;
      // The properties panel is a text field like any other, and a title
      // half-retyped by accident is exactly what locking exists to prevent.
      if (isLocked(activeNote.path)) return;

      patchOpenNote(activeNote.path, { frontmatter, dirty: true });
      await notes.saveNote(activeNote, activeNote.content, frontmatter);
    },
    [activeNote, patchOpenNote, isLocked],
  );

  /**
   * Persists the sidebar's order and reflects it in state in one step.
   *
   * Folders that are no longer in the tree are dropped on the way past. They
   * accumulate whenever a folder is deleted somewhere this device did not
   * watch — another machine, a commit made on github.com — and while they cost
   * nothing to draw (`orderTree` ignores an arrangement for a folder that is
   * not there), a record that only ever grows is one that eventually holds a
   * repository's worth of folders nobody has had in years.
   *
   * Here, rather than in an effect watching the tree: an effect that writes
   * state on every refresh from GitHub is a cascading render on a hot path, to
   * tidy something nothing is reading.
   */
  const putTreeOrder = useCallback(
    (next: TreeOrder) => {
      const workspace = state.activeWorkspace;
      const pruned =
        state.tree.length > 0
          ? prunedOrder(next, withEmptyFolders(state.tree, state.emptyFolders))
          : next;

      patch({ treeOrder: pruned });
      if (workspace) void dbRef.current?.putMeta(treeOrderKey(workspace.id), pruned);
    },
    [state.activeWorkspace, state.tree, state.emptyFolders, patch],
  );

  /** Persists the creation stamps and reflects them in state in one step. */
  const putCreated = useCallback(
    (next: CreationTimes) => {
      const workspace = state.activeWorkspace;
      patch({ createdAt: next });
      if (workspace) void dbRef.current?.putMeta(createdKey(workspace.id), next);
    },
    [state.activeWorkspace, patch],
  );

  const createNote = useCallback(
    async (title: string, folder = "", content?: string, frontmatter?: NoteFrontmatter) => {
      const workspace = state.activeWorkspace;
      const notes = repoRef.current;
      if (!workspace || !notes) return;

      const existing = collectPaths(state.tree);
      const note = await notes.createNote({
        workspaceId: workspace.id,
        folder,
        title,
        existingPaths: existing,
        // Given for a note that comes from somewhere else — a file opened from
        // this machine, a paper being written about — rather than one being
        // started from nothing.
        ...(content !== undefined ? { content } : {}),
        ...(frontmatter !== undefined ? { frontmatter } : {}),
      });

      const open = [...state.openNotes, note].slice(-MAX_OPEN_NOTES);
      // The folders this note sits in now hold something, so they are the
      // repository's business rather than this device's.
      const stillEmpty = state.emptyFolders.filter(
        (candidate) => !`${note.path}/`.startsWith(`${candidate}/`),
      );

      patch({
        openNotes: open,
        activePath: note.path,
        tree: insertIntoTree(state.tree, note.path),
        ...(stillEmpty.length !== state.emptyFolders.length ? { emptyFolders: stillEmpty } : {}),
      });
      if (stillEmpty.length !== state.emptyFolders.length) {
        void dbRef.current?.putMeta(emptyFoldersKey(workspace.id), stillEmpty);
      }
      // So the sidebar can put it where it was written rather than where its
      // name falls in the alphabet.
      putCreated(withCreated(state.createdAt, note.path, new Date().toISOString()));
      rememberTabs(workspace.id, open, note.path);
      return note;
    },
    [
      state.activeWorkspace,
      state.tree,
      state.openNotes,
      state.emptyFolders,
      state.createdAt,
      putCreated,
      patch,
      rememberTabs,
    ],
  );

  /**
   * Deletes whatever is at a path, opened or not.
   *
   * By path rather than by note, because requiring the note first meant a
   * delete could only happen for something the app had managed to read — and
   * an unreadable note (signed out, offline, never opened) is precisely the
   * one somebody is trying to get rid of. The repository handles the rest.
   */
  const deleteNoteAt = useCallback(
    async (path: string) => {
      const notes = repoRef.current;
      const workspace = state.activeWorkspace;
      if (!notes || !workspace) return;

      await notes.deletePath(workspace.id, path, shaFor(state.tree, path));

      // A path left in the locked list would lock the next note created at it,
      // which is a haunting rather than a feature.
      const remaining = forgetLock(state.lockedPaths, path);
      if (remaining.length !== state.lockedPaths.length) putLocked(remaining);

      const open = state.openNotes.filter((candidate) => candidate.path !== path);
      const activePath = state.activePath === path ? (open[0]?.path ?? null) : state.activePath;

      patch({ tree: removeFromTree(state.tree, path), openNotes: open, activePath });
      // A stamp left behind would date the next note created at this path to
      // whenever the deleted one was written.
      putCreated(withoutCreated(state.createdAt, path));
      rememberTabs(workspace.id, open, activePath);
    },
    [
      state.tree,
      state.openNotes,
      state.activePath,
      state.activeWorkspace,
      state.lockedPaths,
      state.createdAt,
      putLocked,
      putCreated,
      patch,
      rememberTabs,
    ],
  );

  const deleteNote = useCallback(async (note: Note) => deleteNoteAt(note.path), [deleteNoteAt]);

  const renameNote = useCallback(
    async (note: Note, toPath: string) => {
      const notes = repoRef.current;
      if (!notes) return;

      const renamed = await notes.renameNote(note, toPath);

      // Renaming a note is not unlocking it. Without this the lock falls off
      // silently, and the reader finds out by typing into a note they had
      // every reason to believe was protected.
      const carried = renameLock(state.lockedPaths, note.path, renamed.path);
      if (state.lockedPaths.includes(note.path)) putLocked(carried);

      const open = state.openNotes.map((candidate) =>
        candidate.path === note.path ? renamed : candidate,
      );
      const activePath = state.activePath === note.path ? renamed.path : state.activePath;

      patch({
        tree: insertIntoTree(removeFromTree(state.tree, note.path), toPath),
        openNotes: open,
        activePath,
      });

      // A rename is the same note under a new name, and a drag into another
      // folder is the same note somewhere else. Neither is a new note, so
      // neither loses when it was written or where somebody put it.
      putCreated(withCreatedRenamed(state.createdAt, note.path, renamed.path));
      putTreeOrder(withPathRenamed(state.treeOrder, note.path, renamed.path));

      if (state.activeWorkspace) rememberTabs(state.activeWorkspace.id, open, activePath);
      return renamed;
    },
    [
      state.tree,
      state.openNotes,
      state.activePath,
      state.activeWorkspace,
      state.lockedPaths,
      state.createdAt,
      state.treeOrder,
      putLocked,
      putCreated,
      putTreeOrder,
      patch,
      rememberTabs,
    ],
  );

  /**
   * Rebuilds the note tree from storage.
   *
   * Folder-wide operations touch many notes at once, and patching the tree
   * once per note would render a half-moved folder on the way through.
   */
  const refreshTree = useCallback(async () => {
    const workspace = state.activeWorkspace;
    const notes = repoRef.current;
    if (!workspace || !notes) return;

    if (workspace.isLocal) {
      const localNotes = await notes.listNotes(workspace.id);
      patch({ tree: treeFromPaths(localNotes.map((note) => note.path)) });
      return;
    }

    patch({ tree: await notes.getTree(workspace.id) });
  }, [state.activeWorkspace, patch]);

  /** Persists the pinned list and reflects it in state in one step. */
  const putPinned = useCallback(
    (next: string[]) => {
      const workspace = state.activeWorkspace;
      patch({ pinnedPaths: next });
      if (workspace) void dbRef.current?.putMeta(pinnedKey(workspace.id), next);
    },
    [state.activeWorkspace, patch],
  );

  /**
   * Switches how the tree is sorted.
   *
   * Folders somebody arranged by hand are left alone: the mode is what to do
   * with everything nobody has said anything about, and throwing away a
   * hand-made order because the mode was changed once would make the mode
   * menu a destructive control.
   */
  const setTreeSortMode = useCallback(
    (mode: TreeSortMode) => putTreeOrder({ ...state.treeOrder, mode }),
    [state.treeOrder, putTreeOrder],
  );

  /**
   * Moves one row up or down within its own folder.
   *
   * `siblings` is what the sidebar is currently drawing, so the recorded order
   * is the one the reader can see rather than the one the sort mode would have
   * produced.
   */
  const moveInTree = useCallback(
    (siblings: readonly TreeNode[], path: string, direction: -1 | 1) =>
      putTreeOrder(withMoved(state.treeOrder, siblings, path, direction)),
    [state.treeOrder, putTreeOrder],
  );

  /** Drops one row into the gap above or below another in the same folder. */
  const dropInTree = useCallback(
    (siblings: readonly TreeNode[], path: string, target: string, position: "before" | "after") =>
      putTreeOrder(withDropped(state.treeOrder, siblings, path, target, position)),
    [state.treeOrder, putTreeOrder],
  );

  /** Puts one folder's contents back under whichever sort mode is in force. */
  const resetTreeOrder = useCallback(
    (parent: string) => putTreeOrder(withoutManual(state.treeOrder, parent)),
    [state.treeOrder, putTreeOrder],
  );

  /** Pins a note, or unpins one already pinned. */
  const togglePinned = useCallback(
    (path: string) => {
      const pinned = state.pinnedPaths;
      putPinned(pinned.includes(path) ? pinned.filter((item) => item !== path) : [...pinned, path]);
    },
    [state.pinnedPaths, putPinned],
  );

  /**
   * Locks a note against editing, or unlocks one already locked.
   *
   * Per note rather than per workspace: the point is a handful of references
   * you keep open and keep reading, not a mode you have to remember you are
   * in. A path that is not in the list is editable, which is what every note
   * is until somebody says otherwise.
   */
  /**
   * Moves a pinned note up or down the list.
   *
   * The order is the only thing here anybody chose, so it is directly
   * editable rather than derived from anything.
   */
  const movePinned = useCallback(
    (path: string, direction: -1 | 1) => {
      const pinned = [...state.pinnedPaths];
      const index = pinned.indexOf(path);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= pinned.length) return;

      [pinned[index], pinned[target]] = [pinned[target]!, pinned[index]!];
      putPinned(pinned);
    },
    [state.pinnedPaths, putPinned],
  );

  /** Persists the empty-folder list and reflects it in state in one step. */
  const putEmptyFolders = useCallback(
    (next: string[]) => {
      const workspace = state.activeWorkspace;
      patch({ emptyFolders: next });
      if (workspace) void dbRef.current?.putMeta(emptyFoldersKey(workspace.id), next);
    },
    [state.activeWorkspace, patch],
  );

  /**
   * Makes a folder at `path`, which may be nested any number of levels deep.
   *
   * Nothing is committed: the folder is real to the repository only once it
   * contains a note. Until then it is remembered on this device so notes can
   * be created inside it — which is the only reason anyone makes a folder.
   */
  const createFolder = useCallback(
    async (path: string) => {
      const clean = normaliseFolder(path);
      if (!clean) return;

      // Already there — as a real folder in the tree, or as one made earlier.
      if (folderExists(state.tree, clean) || state.emptyFolders.includes(clean)) return clean;

      // Every level above it counts as made too, so `a/b/c` leaves `a` and
      // `a/b` on screen rather than one orphaned leaf.
      const ancestors = ancestorFolders(clean).filter(
        (folder) => !folderExists(state.tree, folder) && !state.emptyFolders.includes(folder),
      );

      putEmptyFolders([...state.emptyFolders, ...ancestors, clean].sort());

      // Every level that had to be invented counts as made now, so a folder
      // and its new parent do not end up dated differently.
      const at = new Date().toISOString();
      putCreated(
        [...ancestors, clean].reduce(
          (times, folder) => withCreated(times, folder, at),
          state.createdAt,
        ),
      );

      return clean;
    },
    [state.tree, state.emptyFolders, state.createdAt, putEmptyFolders, putCreated],
  );

  /**
   * Renames a folder by renaming every note under it.
   *
   * Git tracks files, not directories, so this is what "rename a folder" means
   * in a repository: each note moves, and the old directory stops existing
   * because nothing is left in it.
   */
  const renameFolder = useCallback(
    async (from: string, to: string) => {
      const source = normaliseFolder(from);
      const target = normaliseFolder(to);
      const notes = repoRef.current;
      const workspace = state.activeWorkspace;
      if (!notes || !workspace || !source || !target || source === target) return;

      patch({ busy: "Renaming folder…" });
      try {
        // Everything under it, not just the notes. The tree the sidebar is
        // built from lists Markdown only, so renaming from it moved the notes
        // and left their `assets` directory behind at the old path — a folder
        // that had been "moved" was still half there on github.com, and the
        // images every note in it used were in the half that stayed.
        await notes.moveFolderContents(workspace.id, source, target, collectPaths(state.tree));

        putEmptyFolders(
          state.emptyFolders.map((folder) =>
            folder === source || folder.startsWith(`${source}/`)
              ? `${target}${folder.slice(source.length)}`
              : folder,
          ),
        );

        putCreated(withCreatedRenamed(state.createdAt, source, target));
        putTreeOrder(withPathRenamed(state.treeOrder, source, target));

        await refreshTree();
      } finally {
        patch({ busy: null });
      }
    },
    // `state.openNotes` was here to find an already-open note to rename;
    // `moveFolderContents` looks that up itself, so keeping it in this list
    // would rebuild the callback on every keystroke in any open note.
    [
      state.tree,
      state.activeWorkspace,
      state.emptyFolders,
      state.createdAt,
      state.treeOrder,
      putEmptyFolders,
      putCreated,
      putTreeOrder,
      refreshTree,
      patch,
    ],
  );

  /** Deletes a folder and every note inside it. */
  const deleteFolder = useCallback(
    async (path: string) => {
      const folder = normaliseFolder(path);
      const notes = repoRef.current;
      const workspace = state.activeWorkspace;
      if (!notes || !workspace || !folder) return;

      patch({ busy: "Deleting folder…" });
      try {
        // Everything under it, not just the notes. Deleting from the sidebar's
        // Markdown-only tree removed the notes and left the `assets` directory
        // beside them, so a folder deleted here was still on github.com
        // holding files — and, with no note left in it, no longer reachable
        // from the app that made it.
        await notes.deleteFolderContents(workspace.id, folder, collectPaths(state.tree));

        putEmptyFolders(
          state.emptyFolders.filter(
            (candidate) => candidate !== folder && !candidate.startsWith(`${folder}/`),
          ),
        );

        const open = state.openNotes.filter(
          (candidate) => !candidate.path.startsWith(`${folder}/`),
        );
        const activePath = open.some((candidate) => candidate.path === state.activePath)
          ? state.activePath
          : (open[0]?.path ?? null);

        patch({ openNotes: open, activePath });
        putCreated(withoutCreated(state.createdAt, folder));
        putTreeOrder(withoutManual(state.treeOrder, folder));
        rememberTabs(workspace.id, open, activePath);
        await refreshTree();
      } finally {
        patch({ busy: null });
      }
    },
    [
      state.tree,
      state.openNotes,
      state.activePath,
      state.activeWorkspace,
      state.emptyFolders,
      state.createdAt,
      state.treeOrder,
      putEmptyFolders,
      putCreated,
      putTreeOrder,
      refreshTree,
      rememberTabs,
      patch,
    ],
  );

  const setViewMode = useCallback(
    async (mode: EditorViewMode) => {
      const notes = repoRef.current;
      if (!notes || !activeNote) return;

      patchOpenNote(activeNote.path, { viewMode: mode });
      await notes.setViewMode(activeNote, mode);
      await dbRef.current?.putMeta("defaultViewMode", mode);
    },
    [activeNote, patchOpenNote],
  );

  const switchWorkspace = useCallback(
    (workspace: Workspace) => {
      patch({ activeWorkspace: workspace, openNotes: [], activePath: null, tree: [] });
    },
    [patch],
  );

  /**
   * Moves the current workspace onto another branch, or onto a fork.
   *
   * A branch is not a different workspace as far as the user is concerned — it
   * is the same notes, one revision sideways. The stored row is still per
   * branch, because notes, queued commits and the cached tree are filed under
   * the workspace id and a note on `main` is not the note at that path on a
   * draft branch — but the row for the branch being left is retired, so the
   * switcher stays a list of repositories rather than growing a duplicate of
   * the same repository for every branch ever opened.
   *
   * A branch left with unpushed edits is kept; see `collapseBranchDuplicates`.
   * Open notes are cleared because their content and base SHAs belong to the
   * old branch.
   */
  const switchBranch = useCallback(
    async (branch: string, repo?: { owner: string; repo: string }) => {
      const notes = repoRef.current;
      const current = state.activeWorkspace;
      if (!notes || !current || current.isLocal) return;

      const nextRepo = {
        ...current.repo,
        ...(repo ? { owner: repo.owner, repo: repo.repo } : {}),
        branch,
      };

      const next: Workspace = {
        ...current,
        id: workspaceId(nextRepo),
        name: repo ? repo.repo : current.name,
        repo: nextRepo,
        lastOpenedAt: new Date().toISOString(),
      };

      // Nothing to do when the branch is already the one being asked for:
      // re-adding it would clear the open notes and re-read the tree for a
      // move that never happened.
      if (next.id === current.id) return;

      await notes.addWorkspace(next);
      const gateway = gatewayRef.current;
      if (gateway instanceof GitHubGateway) gateway.register(next);

      const listed = [...state.workspaces.filter((w) => w.id !== next.id), next];
      const db = dbRef.current;

      const workspaces = db
        ? await collapseBranchDuplicates({
            workspaces: listed,
            keep: next,
            notes,
            db,
            unregister: (id) => {
              if (gateway instanceof GitHubGateway) gateway.unregister(id);
            },
          })
        : listed;

      patch({
        workspaces,
        activeWorkspace: next,
        openNotes: [],
        activePath: null,
        tree: [],
      });
    },
    [state.activeWorkspace, state.workspaces, patch],
  );

  /**
   * Points the active workspace's published pages at another repository.
   *
   * Not routed through `addWorkspace`: that one clears the open notes and
   * resets the active path, which is right when connecting a repository and
   * completely wrong for changing where a page is committed. Nothing about the
   * notes moves here.
   */
  const setPublishTarget = useCallback(
    async (target: RepoRef | null) => {
      const notes = repoRef.current;
      const active = state.activeWorkspace;
      if (!notes || !active) return;

      const updated = await notes.setPublishTarget(active.id, target);
      if (!updated) return;

      patch({
        workspaces: state.workspaces.map((w) => (w.id === updated.id ? updated : w)),
        activeWorkspace: updated,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.activeWorkspace, state.workspaces],
  );

  const addWorkspace = useCallback(
    async (workspace: Workspace) => {
      const notes = repoRef.current;
      if (!notes) return;

      const owned = ownedBy(workspace, sessionRef.current?.user?.id ?? null);

      await notes.addWorkspace(owned);
      if (gatewayRef.current instanceof GitHubGateway) {
        gatewayRef.current.register(owned);
      }

      patch({
        workspaces: [...state.workspaces.filter((w) => w.id !== owned.id), owned],
        activeWorkspace: owned,
        openNotes: [],
        activePath: null,
        tree: [],
        // The question has been answered, so stop asking it.
        ...(workspace.isLocal ? {} : { needsRepoChoice: false }),
      });
    },
    [state.workspaces, patch],
  );

  const removeWorkspace = useCallback(
    async (id: string) => {
      const notes = repoRef.current;
      if (!notes) return;

      await notes.removeWorkspace(id);
      if (gatewayRef.current instanceof GitHubGateway) gatewayRef.current.unregister(id);

      const remaining = state.workspaces.filter((w) => w.id !== id);
      patch({
        workspaces: remaining,
        ...(state.activeWorkspace?.id === id
          ? { activeWorkspace: remaining[0] ?? null, openNotes: [], activePath: null, tree: [] }
          : {}),
      });
    },
    [state.workspaces, state.activeWorkspace, patch],
  );

  const syncNow = useCallback(() => syncRef.current?.flushNow(), []);

  /**
   * Brings down anything that changed on GitHub since the last look.
   *
   * Sync used to be one-directional: edits were pushed, and anything that
   * arrived from anywhere else — a colleague's commit, the same notebook on a
   * phone, an edit made on github.com — was invisible until the page was
   * reloaded by hand. Which meant the reload had to be guessed at, and
   * anybody who did not guess was writing against a stale copy.
   *
   * Two rules keep this safe. Notes with unpushed local edits are never
   * touched, so a background refresh cannot overwrite something half-written;
   * their divergence is the push's problem, and the conflict machinery already
   * handles it. And the notes that *are* replaced are reported back, so the
   * editor can say so rather than letting the text change by itself.
   */
  const pullRemote = useCallback(async () => {
    const workspace = state.activeWorkspace;
    const notes = repoRef.current;
    if (!workspace || !notes || workspace.isLocal) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    // The tree first: it is one request, and it is what the sidebar shows.
    // `getTree` answers from the cache and refreshes behind it, so the
    // callback is where a real change arrives.
    await notes.getTree(workspace.id, (tree) => patch({ tree }));

    const changed: string[] = [];
    const refreshed = await Promise.all(
      state.openNotes.map(async (note) => {
        if (note.dirty) return note;

        try {
          const latest = await notes.openNote(workspace.id, note.path);
          if (latest.content === note.content) return note;
          changed.push(note.path);
          return latest;
        } catch {
          // Deleted on the remote, or unreachable. Neither is this function's
          // business: closing the tab is the reader's call, and the sidebar
          // has already been told the file is gone.
          return note;
        }
      }),
    );

    if (changed.length > 0) {
      patch({ openNotes: refreshed, remoteChange: { paths: changed, at: Date.now() } });
    }
  }, [state.activeWorkspace, state.openNotes, patch]);

  // Written in an effect rather than during render: a ref is an external
  // system as far as React is concerned, and touching one mid-render is how
  // you get two different answers out of the same pass.
  useEffect(() => {
    pullRef.current = pullRemote;
  }, [pullRemote]);

  /**
   * The unpushed changes for the workspace currently open.
   *
   * Read by the propose-changes flow, which has to write them onto a new
   * branch itself: a branch created from the base holds nothing, and a pull
   * request against a branch with no commits on it is what GitHub rejects.
   */
  const pendingChanges = useCallback((): PendingChange[] => {
    const workspace = state.activeWorkspace;
    if (!workspace) return [];
    return syncRef.current?.pendingFor(workspace.id) ?? [];
  }, [state.activeWorkspace]);

  /** Forgets the queued changes, once something else has committed them. */
  const discardPending = useCallback(async () => {
    const workspace = state.activeWorkspace;
    if (!workspace) return;
    await syncRef.current?.discardPending(workspace.id);
  }, [state.activeWorkspace]);

  /**
   * Takes an image out of every note that shows it.
   *
   * The other half of removing a picture. Dropping the file and leaving the
   * markdown behind is not "removed" — it is a note that used to show a chart
   * and now shows a broken-image icon, in a file the reader was told had been
   * dealt with. The file and the places it was used are one thing, so they go
   * together.
   *
   * A locked note is edited too, deliberately. The lock exists to stop a note
   * being changed by accident; this is somebody deleting a file on purpose,
   * and a reference left pointing at a file that is definitely gone is worse
   * for that note than the edit is.
   */
  const forgetImageEverywhere = useCallback(
    async (workspace: Workspace, path: string) => {
      const notes = repoRef.current;
      if (!notes) return;

      for (const note of await notes.listNotes(workspace.id)) {
        const next = removeReferencesTo(note.path, note.content, path);
        if (next === note.content) continue;

        await notes.saveNote(note, next);
        patchOpenNote(note.path, { content: next, dirty: true });
      }
    },
    [patchOpenNote],
  );

  /**
   * Rewrites any note in this workspace, whether or not it is open.
   *
   * `saveNote` writes the note the editor is showing and `replaceNoteContent`
   * writes one that happens to be in a tab. Repairing a link means writing to
   * a note nobody has looked at today, which is neither of those — so the note
   * is read from storage first, and any tab holding it is brought along.
   */
  const rewriteNote = useCallback(
    async (path: string, change: (content: string) => string): Promise<boolean> => {
      const notes = repoRef.current;
      const workspace = state.activeWorkspace;
      if (!notes || !workspace) return false;

      const open = state.openNotes.find((note) => note.path === path);
      const note = open ?? (await notes.openNote(workspace.id, path));
      if (!note) return false;

      const next = change(note.content);
      if (next === note.content) return false;

      await notes.saveNote(note, next);
      patchOpenNote(path, { content: next, dirty: true });
      return true;
    },
    [state.activeWorkspace, state.openNotes, patchOpenNote],
  );

  /**
   * Drops one stuck change, so the queue behind it can move.
   *
   * The way out of a change that can never be pushed. Needs a refresh of the
   * sync state afterwards because the queue is the thing that changed, and
   * nothing about a removal arrives through a push.
   */
  const discardChange = useCallback(
    async (id: string) => {
      // Read before the discard, since the queue is where the path lives and
      // the discard is what takes it out of there.
      const stuck = state.sync.unpushed.find((change) => change.id === id);
      const workspace = state.activeWorkspace;

      await syncRef.current?.discardChange(id);

      if (stuck && workspace && isImagePath(stuck.path)) {
        await forgetImageEverywhere(workspace, stuck.path);
      }
    },
    [state.sync.unpushed, state.activeWorkspace, forgetImageEverywhere],
  );

  /**
   * Changes how eagerly this workspace pushes.
   *
   * Auto is the default and stays the default; this only exists for the people
   * who want their commit log to read as deliberate work rather than as a
   * transcript of their typing. Nothing here affects local saving, which is
   * always immediate whatever the mode.
   */
  const setSyncMode = useCallback(
    async (mode: SyncMode, intervalMinutes?: number) => {
      const workspace = state.activeWorkspace;
      const preference: SyncPreference = {
        mode,
        intervalMinutes: intervalMinutes ?? state.syncPreference.intervalMinutes,
      };

      syncRef.current?.setMode(preference.mode, preference.intervalMinutes);
      patch({ syncPreference: preference });

      if (workspace) await dbRef.current?.putMeta(syncPrefKey(workspace), preference);
    },
    [state.activeWorkspace, state.syncPreference.intervalMinutes, patch],
  );

  const resolveConflict = useCallback(
    async (path: string, resolution: "keep-local" | "keep-remote" | "keep-both") => {
      const workspace = state.activeWorkspace;
      if (!workspace) return;

      await syncRef.current?.resolveConflict(workspace.id, path, resolution);

      // Re-read the note so every tab showing it gets whatever the resolution
      // produced, rather than keeping the copy that lost.
      const notes = repoRef.current;
      if (notes && state.openNotes.some((note) => note.path === path)) {
        const fresh = await notes.openNote(workspace.id, path);
        patchOpenNote(path, fresh);
      }
    },
    [state.activeWorkspace, state.openNotes, patchOpenNote],
  );

  const allNotes = useCallback(async () => {
    const workspace = state.activeWorkspace;
    const notes = repoRef.current;
    if (!workspace || !notes) return [];
    return notes.listNotes(workspace.id);
  }, [state.activeWorkspace]);

  // ── Images held on this device ──────────────────────────────────────────

  /**
   * Object URLs for stored images, keyed by `${workspaceId}::${path}`.
   *
   * Held in a ref that outlives any one effect run, and never revoked as part
   * of an effect's cleanup. That is deliberate: React runs an effect, cleans it
   * up and runs it again on mount in development, so revoking there handed the
   * document a URL that had already been torn down — every image in the note
   * rendered as a broken box, and only in development, which is the worst place
   * for a bug to live.
   *
   * The bytes behind these are released when the tab goes away. The set is
   * bounded by the images actually opened in one session, which for a notebook
   * is tens, not thousands.
   */
  const assetUrlCache = useRef<Map<string, string>>(new Map());
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  const activeWorkspaceId = state.activeWorkspace?.id ?? null;

  /** The cached URL for an asset, creating it the first time it is asked for. */
  const urlForAsset = useCallback((asset: LocalAsset): string => {
    const existing = assetUrlCache.current.get(asset.id);
    if (existing) return existing;

    const url = assetObjectUrl(asset);
    assetUrlCache.current.set(asset.id, url);
    return url;
  }, []);

  useEffect(() => {
    const db = dbRef.current;
    if (!db || !activeWorkspaceId) return;

    let cancelled = false;

    void db.listAssets(activeWorkspaceId).then((assets) => {
      if (cancelled) return;

      const urls: Record<string, string> = {};
      for (const asset of assets) urls[asset.path] = urlForAsset(asset);
      setAssetUrls(urls);
    });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, state.ready, urlForAsset]);

  /**
   * Stores an image on this device and makes it renderable straight away.
   *
   * Used for a workspace with no repository, where there is nowhere to commit
   * to, and as a cache for one that has: an image that has just been committed
   * renders from here immediately rather than after a round trip through the
   * proxy for bytes this tab already holds.
   */
  const putAsset = useCallback(
    async (repoPath: string, file: File, pushed: boolean) => {
      const db = dbRef.current;
      const workspace = state.activeWorkspace;
      if (!db || !workspace) return;

      const asset = await assetFrom({ workspace, repoPath, file, pushed });
      await db.putAsset(asset);

      /**
       * Queued for GitHub the same way the note's text is.
       *
       * Not pushed on the spot: an upload that fails — offline, a tab closed a
       * second after the paste, a token expiring — used to be lost silently,
       * leaving a note on GitHub pointing at a file that was never committed.
       * In the queue it retries, survives a restart, and lands in the same
       * commit as the writing that refers to it.
       */
      if (!pushed && !workspace.isLocal) {
        await syncRef.current?.recordAssetUpsert(workspace.id, repoPath, asset.data);
      }

      // Replacing a path that already had a URL: the old one is dropped from
      // the cache here, since nothing else will ever ask for it again.
      const previous = assetUrlCache.current.get(asset.id);
      if (previous) {
        URL.revokeObjectURL(previous);
        assetUrlCache.current.delete(asset.id);
      }

      const url = urlForAsset(asset);
      setAssetUrls((current) => ({ ...current, [repoPath]: url }));
    },
    [state.activeWorkspace, urlForAsset],
  );

  /**
   * Makes a stuck image small enough to send, and sends it.
   *
   * The alternative on offer used to be deletion, full stop, which is a
   * strange demand to make about a screenshot that is perfectly good and
   * merely bigger than one request will carry. The resized file replaces the
   * original everywhere it is held — the copy on this device and the bytes
   * waiting in the queue — so the note keeps rendering the picture it always
   * did, at a size that fits.
   */
  const shrinkChange = useCallback(
    async (id: string, targetBytes: number) => {
      const engine = syncRef.current;
      const db = dbRef.current;
      const workspace = state.activeWorkspace;
      const stuck = state.sync.unpushed.find((change) => change.id === id);

      if (!engine || !db || !workspace || !stuck) {
        throw new ShrinkError("That change is no longer waiting to be sent.");
      }

      const asset = await db.getAsset(`${workspace.id}::${stuck.path}`);
      if (!asset) {
        throw new ShrinkError(
          "The picture itself is not on this device any more, so there is nothing left to resize.",
        );
      }

      const before = assetBlob(asset);
      const shrunk = await shrinkImage(before, targetBytes);
      const data = await blobAsBase64(shrunk.blob);

      await db.putAsset({ ...asset, data });
      await engine.replaceContent(id, data, "base64");

      // The note is showing the old bytes through an object URL made from
      // them. Without this the picture on screen stays the big one until the
      // tab is reloaded, which makes it look as though nothing happened.
      const stale = assetUrlCache.current.get(asset.id);
      if (stale) {
        URL.revokeObjectURL(stale);
        assetUrlCache.current.delete(asset.id);
      }
      const url = urlForAsset({ ...asset, data });
      setAssetUrls((current) => ({ ...current, [asset.path]: url }));

      return { before: before.size, after: shrunk.blob.size, ...shrunk };
    },
    [state.activeWorkspace, state.sync.unpushed, urlForAsset],
  );

  // ── The words documents are made of ─────────────────────────────────────

  /**
   * Keeps a document's text after it has been read once.
   *
   * The reader extracts it anyway — that is what makes find-in-document work —
   * and used to throw it away when the document closed, so the words were
   * searchable for exactly as long as somebody was looking at them. Kept, they
   * are what ⌘K searches and what a citation is checked against.
   */
  const saveDocumentText = useCallback(
    async (path: string, pages: { page: number; text: string }[]) => {
      const db = dbRef.current;
      const workspace = state.activeWorkspace;
      if (!db || !workspace || workspace.isLocal) return;

      await db.putPdfText(entryFrom(workspace.id, path, pages));
    },
    [state.activeWorkspace],
  );

  const documentText = useCallback(
    async (path: string) => {
      const db = dbRef.current;
      const workspace = state.activeWorkspace;
      if (!db || !workspace) return undefined;

      return db.getPdfText(pdfTextId(workspace.id, path));
    },
    [state.activeWorkspace],
  );

  const allDocumentText = useCallback(async () => {
    const db = dbRef.current;
    const workspace = state.activeWorkspace;
    if (!db || !workspace) return [];

    return db.listPdfText(workspace.id);
  }, [state.activeWorkspace]);

  /** Remembers which folders are open, for the next visit. */
  const setExpandedFolders = useCallback(
    (paths: string[]) => {
      const workspace = state.activeWorkspace;
      patch({ expandedFolders: paths });
      if (workspace) void dbRef.current?.putMeta(expandedKey(workspace.id), paths);
    },
    [state.activeWorkspace, patch],
  );

  /**
   * The tree as the sidebar draws it: the repository, plus the folders made
   * here that are still waiting for their first note, in the order the reader
   * asked for.
   *
   * The ordering happens here rather than in the tree itself because the tree
   * is replaced wholesale by every refresh from GitHub — an order written into
   * it would survive exactly until the next pull.
   */
  const displayTree = useMemo(
    () =>
      orderTree(withEmptyFolders(state.tree, state.emptyFolders), state.treeOrder, state.createdAt),
    [state.tree, state.emptyFolders, state.treeOrder, state.createdAt],
  );

  return useMemo(
    () => ({
      ...state,
      /** The note the editor is showing. Derived from the open set. */
      note: activeNote,
      openNote,
      closeNote,
      openNoteAndReturn,
      saveNote,
      replaceNoteContent,
      updateFrontmatter,
      createNote,
      deleteNote,
      deleteNoteAt,
      renameNote,
      createFolder,
      togglePinned,
      toggleLocked,
      isLocked,
      movePinned,
      setTreeSortMode,
      moveInTree,
      dropInTree,
      resetTreeOrder,
      renameFolder,
      deleteFolder,
      setViewMode,
      switchWorkspace,
      switchBranch,
      addWorkspace,
      setPublishTarget,
      removeWorkspace,
      syncNow,
      refreshTree,
      pullRemote,
      pendingChanges,
      discardPending,
      discardChange,
      shrinkChange,
      rewriteNote,
      saveDocumentText,
      documentText,
      allDocumentText,
      setSyncMode,
      resolveConflict,
      allNotes,
      assetUrls,
      putAsset,
      setExpandedFolders,
      dismissError: () => patch({ error: null }),
      /**
       * Surfaces a failure from work that finished after its caller returned.
       *
       * Background work has nobody left to throw to. A pasted image that is
       * saved on this device but never reaches GitHub has to say so, or
       * somebody closes the tab believing it was committed.
       */
      reportError: (message: string) => patch({ error: message }),
      /** The tree as the sidebar should draw it. See `displayTree`. */
      tree: displayTree,
    }),
    [
      state,
      activeNote,
      assetUrls,
      putAsset,
      setExpandedFolders,
      openNote,
      closeNote,
      openNoteAndReturn,
      saveNote,
      replaceNoteContent,
      updateFrontmatter,
      createNote,
      deleteNote,
      deleteNoteAt,
      renameNote,
      createFolder,
      togglePinned,
      toggleLocked,
      isLocked,
      movePinned,
      setTreeSortMode,
      moveInTree,
      dropInTree,
      resetTreeOrder,
      renameFolder,
      deleteFolder,
      displayTree,
      setViewMode,
      switchWorkspace,
      switchBranch,
      addWorkspace,
      setPublishTarget,
      removeWorkspace,
      syncNow,
      refreshTree,
      pullRemote,
      pendingChanges,
      discardPending,
      discardChange,
      allDocumentText,
      documentText,
      saveDocumentText,
      rewriteNote,
      shrinkChange,
      setSyncMode,
      resolveConflict,
      allNotes,
      patch,
    ],
  );
}

// ─── Tree helpers ───────────────────────────────────────────────────────────
// The tree is updated locally on create/rename/delete so the sidebar responds
// instantly; the authoritative version arrives on the next refresh.

function collectPaths(tree: TreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "file") paths.push(node.path);
      if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return paths;
}

function insertIntoTree(tree: TreeNode[], path: string): TreeNode[] {
  const folder = dirname(path);
  const name = path.split("/").pop()!;
  const node: TreeNode = { path, name, kind: "file" };

  if (folder === "") return sortNodes([...tree, node]);

  // The folder has to be on the tree before the note can go in it. Without
  // this, a note created in a folder that only existed locally was written to
  // storage and then dropped from the sidebar — it reappeared on the next
  // refresh, so it read as the note simply not being created.
  const withFolder = ensureFolder(tree, folder);

  const insert = (nodes: TreeNode[], prefix: string): TreeNode[] =>
    nodes.map((current) => {
      if (current.kind !== "folder") return current;
      if (current.path === prefix) {
        return { ...current, children: sortNodes([...(current.children ?? []), node]) };
      }
      if (prefix.startsWith(`${current.path}/`)) {
        return { ...current, children: insert(current.children ?? [], prefix) };
      }
      return current;
    });

  return insert(withFolder, folder);
}

/**
 * A nested tree from a flat list of note paths.
 *
 * Local mode has no GitHub tree to read, and the list of stored notes was being
 * turned into a flat list of filenames — so a note at `Projects/2026/roadmap.md`
 * appeared beside the top-level ones as plain `roadmap`, and folders made on
 * this device vanished from the sidebar the moment they held something. The
 * folder structure is right there in the paths; this reads it back out.
 */
function treeFromPaths(paths: string[]): TreeNode[] {
  return paths.reduce<TreeNode[]>((tree, path) => insertIntoTree(tree, path), []);
}

/** A folder path with the noise taken out: no slashes at either end, no `..`. */
function normaliseFolder(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("/");
}

/** `a/b/c` → `["a", "a/b"]`. Every level a folder needs above it. */
function ancestorFolders(path: string): string[] {
  const segments = normaliseFolder(path).split("/");
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}

function folderExists(tree: TreeNode[], path: string): boolean {
  for (const node of tree) {
    if (node.kind !== "folder") continue;
    if (node.path === path) return true;
    if (path.startsWith(`${node.path}/`) && folderExists(node.children ?? [], path)) return true;
  }
  return false;
}

/** Adds `path` to the tree as a folder, creating any missing level above it. */
function ensureFolder(tree: TreeNode[], path: string): TreeNode[] {
  const segments = normaliseFolder(path).split("/").filter(Boolean);
  if (segments.length === 0) return tree;

  const add = (nodes: TreeNode[], depth: number, prefix: string): TreeNode[] => {
    const current = prefix ? `${prefix}/${segments[depth]}` : segments[depth]!;
    const existing = nodes.find((node) => node.kind === "folder" && node.path === current);

    const children =
      depth + 1 < segments.length
        ? add(existing?.children ?? [], depth + 1, current)
        : (existing?.children ?? []);

    const folder: TreeNode = {
      path: current,
      name: segments[depth]!,
      kind: "folder",
      children,
    };

    return sortNodes([...nodes.filter((node) => node.path !== current), folder]);
  };

  return add(tree, 0, "");
}

/**
 * The repository's tree with the locally made, still-empty folders grafted on.
 *
 * Kept as a display-time merge rather than written into `state.tree`: the real
 * tree is refreshed from GitHub, and anything merged into it would be wiped by
 * the next refresh.
 */
function withEmptyFolders(tree: TreeNode[], folders: string[]): TreeNode[] {
  return folders.reduce((accumulated, folder) => ensureFolder(accumulated, folder), tree);
}

function removeFromTree(tree: TreeNode[], path: string): TreeNode[] {
  return tree
    .filter((node) => node.path !== path)
    .map((node) =>
      node.children ? { ...node, children: removeFromTree(node.children, path) } : node,
    );
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort(compareTreeEntries);
}

/** The blob SHA the tree reported for a path, when it reported one. */
function shaFor(tree: TreeNode[], path: string): string | undefined {
  for (const node of tree) {
    if (node.path === path) return node.sha;
    if (node.children) {
      const found = shaFor(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}
