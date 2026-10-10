import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { noteMarker } from "@forkleaf/github-client";
import {
  activityFromWebhook,
  activityKey,
  activityStream,
  excerptOf,
  verifySignature,
} from "./live-activity";

const sign = (secret: string, body: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifySignature", () => {
  it("accepts GitHub's signature and refuses anything else", async () => {
    const body = '{"action":"created"}';
    expect(await verifySignature("s3cret", body, sign("s3cret", body))).toBe(true);
    expect(await verifySignature("s3cret", body, sign("wrong", body))).toBe(false);
    expect(await verifySignature("s3cret", `${body} `, sign("s3cret", body))).toBe(false);
    expect(await verifySignature("s3cret", body, null)).toBe(false);
    expect(await verifySignature("s3cret", body, "sha1=abc")).toBe(false);
    expect(await verifySignature("s3cret", body, "sha256=zz")).toBe(false);
  });

  it("accepts an upper-case signature", async () => {
    const body = "{}";
    expect(
      await verifySignature("k", body, sign("k", body).toUpperCase().replace("SHA256", "sha256")),
    ).toBe(true);
  });
});

describe("activityFromWebhook", () => {
  const now = new Date("2026-10-10T09:00:00Z");
  const base = {
    repository: { full_name: "Me/Notes" },
    sender: { login: "ada" },
    discussion: { number: 12, title: "Rotate keys?", body: `x\n${noteMarker("ops/keys.md")}` },
  };

  it("turns a new comment into an entry, with the start of the message", () => {
    expect(
      activityFromWebhook(
        "discussion_comment",
        {
          ...base,
          action: "created",
          comment: { body: "Monthly, with the script.", parent_id: null },
        },
        now,
      ),
    ).toEqual({
      owner: "Me",
      repo: "Notes",
      entry: {
        n: 12,
        kind: "comment",
        title: "Rotate keys?",
        by: "ada",
        at: "2026-10-10T09:00:00.000Z",
        note: "ops/keys.md",
        excerpt: "Monthly, with the script.",
      },
    });
  });

  it("tells a reply from a comment", () => {
    const activity = activityFromWebhook("discussion_comment", {
      ...base,
      action: "created",
      comment: { body: "Thanks", parent_id: 4 },
    });
    expect(activity?.entry.kind).toBe("reply");
  });

  it("keeps no text for an edit or a deletion", () => {
    for (const action of ["edited", "deleted"]) {
      const activity = activityFromWebhook("discussion_comment", {
        ...base,
        action,
        comment: { body: "secret new wording" },
      });
      expect(activity?.entry).toMatchObject({ kind: action, excerpt: null });
    }
  });

  it("records a new discussion with its opening words, and answers, locks and the rest", () => {
    expect(
      activityFromWebhook("discussion", {
        ...base,
        action: "created",
        discussion: { number: 13, title: "New", body: "What about **this**?" },
      })?.entry,
    ).toMatchObject({ n: 13, kind: "discussion", excerpt: "What about **this**?", note: null });
    expect(activityFromWebhook("discussion", { ...base, action: "answered" })?.entry.kind).toBe(
      "answered",
    );
    expect(activityFromWebhook("discussion", { ...base, action: "transferred" })?.entry.kind).toBe(
      "other",
    );
  });

  it("ignores anything that is not about a discussion", () => {
    expect(activityFromWebhook("push", base)).toBeNull();
    expect(activityFromWebhook("discussion", { action: "created" })).toBeNull();
  });
});

describe("excerptOf", () => {
  it("drops markers, folds whitespace and shortens", () => {
    expect(excerptOf(`Hello\n\n  there <!-- sha1: abc -->`)).toBe("Hello there");
    expect(excerptOf("x".repeat(200))).toHaveLength(140);
    expect(excerptOf("x".repeat(200))!.endsWith("…")).toBe(true);
    expect(excerptOf("<!-- only a marker -->")).toBeNull();
    expect(excerptOf(null)).toBeNull();
  });
});

describe("activityKey", () => {
  it("is one log per repository, whatever the case it is written in", () => {
    expect(activityKey("Me", "Notes")).toBe(activityKey("me", "notes"));
  });
});

describe("activityStream", () => {
  async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text;
      text += decoder.decode(value);
    }
  }

  it("says it is ready at the current version, then sends what arrives after", async () => {
    let call = 0;
    const logs = [
      { version: 5, entries: [{ v: 5, n: 1 }] },
      {
        version: 7,
        entries: [
          { v: 7, n: 3 },
          { v: 6, n: 2 },
          { v: 5, n: 1 },
        ],
      },
    ];
    const text = await readAll(
      activityStream({
        readLog: async () => logs[Math.min(call++, 1)]!,
        since: null,
        signal: new AbortController().signal,
        pollMs: 1,
        durationMs: 30,
      }),
    );

    expect(text.startsWith('retry: 3000\nevent: ready\ndata: {"version":5}\n\n')).toBe(true);
    // Version 5 was already there when the stream opened: not news.
    expect(text).not.toContain('"n":1');
    expect(text).toContain('id: 6\nevent: activity\ndata: {"v":6,"n":2}\n\n');
    expect(text.indexOf("id: 6")).toBeLessThan(text.indexOf("id: 7"));
    expect(text.match(/id: 7/g)).toHaveLength(1);
  });

  it("picks up where the browser left off", async () => {
    const text = await readAll(
      activityStream({
        readLog: async () => ({
          version: 9,
          entries: [
            { v: 9, n: 3 },
            { v: 8, n: 2 },
            { v: 7, n: 1 },
          ],
        }),
        since: 7,
        signal: new AbortController().signal,
        pollMs: 1,
        durationMs: 10,
      }),
    );
    expect(text).not.toContain("event: ready");
    expect(text).not.toContain("id: 7\n");
    expect(text).toContain("id: 8\n");
    expect(text).toContain("id: 9\n");
  });

  it("starts again when the log has been reset under it", async () => {
    const text = await readAll(
      activityStream({
        readLog: async () => ({ version: 2, entries: [{ v: 2, n: 1 }] }),
        since: 40,
        signal: new AbortController().signal,
        pollMs: 1,
        durationMs: 10,
      }),
    );
    expect(text).toContain('event: ready\ndata: {"version":2}');
  });

  it("keeps a quiet connection open with heartbeats, and ends when the browser leaves", async () => {
    const controller = new AbortController();
    const stream = activityStream({
      readLog: async () => ({ version: 0, entries: [] }),
      since: 0,
      signal: controller.signal,
      pollMs: 1,
      heartbeatMs: 0,
      durationMs: 60_000,
    });
    setTimeout(() => controller.abort(), 20);
    const text = await readAll(stream);
    expect(text).toContain(": still here\n\n");
  });

  it("ends, rather than throwing, when the store fails", async () => {
    const text = await readAll(
      activityStream({
        readLog: async () => {
          throw new Error("store down");
        },
        since: null,
        signal: new AbortController().signal,
        pollMs: 1,
        durationMs: 1000,
      }),
    );
    expect(text).toBe("");
  });
});

describe("activityStream — a browser that leaves", () => {
  it("stops reading the log once the stream is cancelled, without an error", async () => {
    let reads = 0;
    const stream = activityStream({
      readLog: async () => {
        reads += 1;
        return { version: reads, entries: [{ v: reads, n: reads }] };
      },
      since: 0,
      signal: new AbortController().signal,
      pollMs: 2,
      durationMs: 60_000,
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    const after = reads;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(reads - after).toBeLessThanOrEqual(1);
  });
});

describe("activityStream — cheap checks", () => {
  it("reads the entries only when the version says there is something new", async () => {
    let version = 3;
    let logReads = 0;
    let versionReads = 0;
    const stream = activityStream({
      readVersion: async () => {
        versionReads += 1;
        if (versionReads === 4) version = 4;
        return version;
      },
      readLog: async () => {
        logReads += 1;
        return { version, entries: [{ v: 4, n: 9 }] };
      },
      since: null,
      signal: new AbortController().signal,
      pollMs: 1,
      durationMs: 40,
    });
    const reader = stream.getReader();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    expect(versionReads).toBeGreaterThan(4);
    expect(logReads).toBe(1);
    expect(text).toContain("id: 4\nevent: activity");
  });
});
