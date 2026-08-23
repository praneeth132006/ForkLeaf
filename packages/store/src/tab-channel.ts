/**
 * A message bus between ForkLeaf tabs.
 *
 * Two tabs on the same notes have always been able to get in each other's way.
 * IndexedDB allows exactly one connection to hold a database across a version
 * change, so a tab left open on an older build blocks a newer one from opening
 * at all — and the older tab has no idea it is doing it. The only defence was a
 * timeout: wait eight seconds, then tell the user to go and close their other
 * tabs. That is a workaround, not a fix, and eight seconds of a blank loading
 * screen is a long time to be told to do something you did not know you had
 * done.
 *
 * `BroadcastChannel` lets the tabs simply ask. The blocked tab says "I need the
 * database"; every other tab closes its handle and reopens on its next read;
 * the upgrade proceeds in milliseconds. The timeout stays as a backstop for
 * browsers without the API, or a tab too wedged to answer.
 *
 * The same channel then earns its keep for the ordinary case: a note saved in
 * one tab tells the others, so a second tab showing the same library updates
 * instead of quietly displaying a stale copy until it is reloaded.
 */

export type TabMessage =
  /** "I am blocked on the database — everyone let go." */
  | { type: "release-db"; wanted: number }
  /** "I have let go." Sent by each tab that acts on `release-db`. */
  | { type: "released-db" }
  /** Notes were written locally. Other tabs holding them should re-read. */
  | { type: "notes-changed"; workspaceId: string; paths: string[] }
  /** The pending-change queue moved: something was queued, pushed or dropped. */
  | { type: "queue-changed"; workspaceId: string }
  /** A repository was connected or disconnected. */
  | { type: "workspaces-changed" };

export type TabListener = (message: TabMessage) => void;

const CHANNEL_NAME = "forkleaf";

/** True when this browser can talk between tabs at all. */
export function tabChannelAvailable(): boolean {
  return typeof BroadcastChannel !== "undefined";
}

/**
 * The channel, with every no-op the fallback needs built in.
 *
 * Never throws and never requires a feature check at the call site: a browser
 * without `BroadcastChannel` — or a server render, where there are no tabs —
 * gets an object whose `post` goes nowhere, and the code around it is
 * unchanged.
 */
export class TabChannel {
  private channel: BroadcastChannel | null = null;
  private readonly listeners = new Set<TabListener>();

  constructor(name = CHANNEL_NAME) {
    if (!tabChannelAvailable()) return;

    try {
      this.channel = new BroadcastChannel(name);
      this.channel.onmessage = (event: MessageEvent<TabMessage>) => {
        const message = event.data;
        // Another origin's message, or a future version of ForkLeaf sending
        // something this build has no idea about.
        if (!message || typeof message.type !== "string") return;
        for (const listener of [...this.listeners]) listener(message);
      };
    } catch {
      // Some privacy modes expose the constructor and then refuse to build one.
      this.channel = null;
    }
  }

  get available(): boolean {
    return this.channel !== null;
  }

  /** Sends to every *other* tab. A BroadcastChannel never echoes to itself. */
  post(message: TabMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // A closed channel, or a message that would not clone. Neither is worth
      // failing a save over.
    }
  }

  on(listener: TabListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Waits for `count` tabs to answer a `release-db`, or for `timeoutMs`.
   *
   * The timeout is the point: there is no way to know how many other tabs
   * exist, so this waits for the first answer and gives up quickly if none
   * comes, rather than trading one long stall for another.
   */
  waitFor(type: TabMessage["type"], timeoutMs: number): Promise<boolean> {
    if (!this.channel) return Promise.resolve(false);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(false);
      }, timeoutMs);

      const off = this.on((message) => {
        if (message.type !== type) return;
        clearTimeout(timer);
        off();
        resolve(true);
      });
    });
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

/**
 * The channel this tab uses, created on first use.
 *
 * A single shared instance rather than one per caller: `BroadcastChannel` keeps
 * a page alive for message delivery, and opening one per hook would leak them
 * across every navigation.
 */
let shared: TabChannel | null = null;

export function tabChannel(): TabChannel {
  shared ??= new TabChannel();
  return shared;
}

/** Drops the shared channel. Only used by tests. */
export function resetTabChannel(): void {
  shared?.close();
  shared = null;
}
