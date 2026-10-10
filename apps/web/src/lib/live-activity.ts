import { notePathOf } from "@forkleaf/github-client";

/**
 * Conversations arriving as they happen.
 *
 * GitHub tells ForkLeaf's GitHub App about every discussion and comment
 * through a webhook. The webhook writes one short entry per event into a log
 * per repository; every browser with that repository open is holding a
 * stream that reads the log and passes on what is new. The browser then reads
 * the conversation itself through the usual routes — the entry is a nudge,
 * not the message.
 *
 * Without a webhook secret configured none of this runs, and the app keeps
 * asking every fifteen seconds as before.
 */

/** What the log keeps, per repository. */
export const LOG_MAX = 50;
export const LOG_TTL_MS = 24 * 60 * 60 * 1000;

export type ActivityKind =
  | "comment"
  | "reply"
  | "discussion"
  | "edited"
  | "deleted"
  | "answered"
  | "unanswered"
  | "locked"
  | "unlocked"
  | "other";

/** One thing that happened, as the browser hears about it. */
export interface ActivityEntry {
  /** The log's version when this was written. */
  v: number;
  /** The discussion's number. */
  n: number;
  kind: ActivityKind;
  title: string;
  /** Who did it. */
  by: string | null;
  at: string;
  /** The note it is about, when ForkLeaf opened the discussion for one. */
  note: string | null;
  /** The start of a new message, for a notification. Nothing for edits or deletions. */
  excerpt: string | null;
}

/** The log a repository's activity is kept in. */
export function activityKey(owner: string, repo: string): string {
  return `live:${owner}/${repo}`.toLowerCase();
}

/** A message, shortened for a notification, with ForkLeaf's markers gone. */
export function excerptOf(body: string | null | undefined, length = 140): string | null {
  const text = (body ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

interface WebhookPayload {
  action?: string;
  repository?: { full_name?: string };
  sender?: { login?: string } | null;
  discussion?: { number?: number; title?: string; body?: string | null };
  comment?: { body?: string | null; parent_id?: number | null };
}

/**
 * The entry a webhook delivery becomes — and the repository it is for — or
 * null for events that are not about a discussion.
 */
export function activityFromWebhook(
  event: string,
  payload: WebhookPayload,
  now: Date = new Date(),
): { owner: string; repo: string; entry: Omit<ActivityEntry, "v"> } | null {
  if (event !== "discussion" && event !== "discussion_comment") return null;

  const fullName = payload.repository?.full_name ?? "";
  const [owner, repo] = fullName.split("/");
  const number = payload.discussion?.number;
  if (!owner || !repo || typeof number !== "number") return null;

  const action = payload.action ?? "";
  let kind: ActivityKind;
  let excerpt: string | null = null;

  if (event === "discussion_comment") {
    if (action === "created") {
      kind = payload.comment?.parent_id ? "reply" : "comment";
      excerpt = excerptOf(payload.comment?.body);
    } else if (action === "edited") {
      kind = "edited";
    } else if (action === "deleted") {
      kind = "deleted";
    } else {
      kind = "other";
    }
  } else if (action === "created") {
    kind = "discussion";
    excerpt = excerptOf(payload.discussion?.body);
  } else if (
    ["edited", "deleted", "answered", "unanswered", "locked", "unlocked"].includes(action)
  ) {
    kind = action as ActivityKind;
  } else {
    kind = "other";
  }

  return {
    owner,
    repo,
    entry: {
      n: number,
      kind,
      title: (payload.discussion?.title ?? "").slice(0, 120),
      by: payload.sender?.login ?? null,
      at: now.toISOString(),
      note: notePathOf(payload.discussion?.body ?? ""),
      excerpt,
    },
  };
}

/** Reads a webhook signature: `sha256=<hex>`, compared in constant time. */
export async function verifySignature(
  secret: string,
  body: string,
  header: string | null,
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const given = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  const expected = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant time, so how much of a guess was right cannot be timed.
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= expected.charCodeAt(i) ^ given.toLowerCase().charCodeAt(i);
  }
  return difference === 0;
}

// ─── The stream ─────────────────────────────────────────────────────────────

export interface StreamOptions {
  /** Reads the repository's log. */
  readLog: () => Promise<{ version: number; entries: Record<string, unknown>[] }>;
  /** The last version the browser saw, or null to start from now. */
  since: number | null;
  signal: AbortSignal;
  /** How often the log is read. Cheap: one read of a shared store, never GitHub. */
  pollMs?: number;
  /** A comment line, so proxies do not close a quiet connection. */
  heartbeatMs?: number;
  /** How long one stream lasts; the browser reconnects where it left off. */
  durationMs?: number;
}

const encoder = new TextEncoder();

/**
 * Server-sent events: `ready` once, then one `activity` event per new entry,
 * each with its version as the event id — which the browser sends back as
 * Last-Event-ID when it reconnects, so nothing is missed between streams.
 */
export function activityStream(options: StreamOptions): ReadableStream<Uint8Array> {
  const pollMs = options.pollMs ?? 2000;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const durationMs = options.durationMs ?? 240_000;

  // Shared with `cancel`: a browser that goes away cancels the stream, and
  // the loop must stop writing to it rather than throw on a closed one.
  let closed = false;

  return new ReadableStream({
    cancel() {
      closed = true;
    },
    async start(controller) {
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      options.signal.addEventListener("abort", close);

      const started = Date.now();
      let lastBeat = started;
      let since = options.since;

      try {
        while (!closed && !options.signal.aborted && Date.now() - started < durationMs) {
          const log = await options.readLog();
          // A log that expired or was reset starts again from 1; a browser
          // that saw version 40 of the old one must not wait for 41.
          if (since === null || since > log.version) {
            since = log.version;
            send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ version: since })}\n\n`);
          }
          const fresh = log.entries
            .filter((entry) => typeof entry.v === "number" && (entry.v as number) > since!)
            .sort((a, b) => (a.v as number) - (b.v as number));
          for (const entry of fresh) {
            send(`id: ${entry.v as number}\nevent: activity\ndata: ${JSON.stringify(entry)}\n\n`);
            since = entry.v as number;
          }
          if (Date.now() - lastBeat >= heartbeatMs) {
            send(": still here\n\n");
            lastBeat = Date.now();
          }
          await new Promise((resolve) => setTimeout(resolve, pollMs));
        }
      } catch {
        // A store that fails mid-stream ends the stream; the browser
        // reconnects, and asks every fifteen seconds in the meantime.
      }
      close();
    },
  });
}
