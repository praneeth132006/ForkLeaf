import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpellService, type SpellStorage, type SpellTransport } from "./spelling";

/**
 * The page's half of spelling: asking the dictionary worker, remembering what
 * it said, and the words a person adds. The worker is replaced by a fake that
 * answers like the real one; the last block runs the real worker code against
 * the real English dictionary.
 */

function fakeWorker(misspelt: Record<string, string[]>) {
  const sent: Array<Record<string, unknown>> = [];
  const transport: SpellTransport = {
    onmessage: null,
    postMessage(message) {
      const data = message as Record<string, unknown>;
      sent.push(data);
      queueMicrotask(() => {
        if (data.type === "check") {
          transport.onmessage?.({
            data: {
              id: data.id,
              type: "checked",
              results: (data.words as string[]).map((word) => [word, !(word in misspelt)]),
            },
          } as MessageEvent);
        } else if (data.type === "suggest") {
          transport.onmessage?.({
            data: {
              id: data.id,
              type: "suggested",
              suggestions: misspelt[data.word as string] ?? [],
            },
          } as MessageEvent);
        }
      });
    },
  };
  return { transport, sent };
}

function memoryStorage(initial: Record<string, string> = {}): SpellStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => void (data[key] = value),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SpellService", () => {
  it("knows nothing until asked, then batches the asking", async () => {
    vi.useFakeTimers();
    const worker = fakeWorker({ recieve: ["receive"] });
    const service = new SpellService(() => worker.transport, memoryStorage());
    const told = vi.fn();
    service.subscribe(told);

    expect(service.check("recieve")).toBeUndefined();
    service.request(["recieve", "letter"]);
    service.request(["letter", "today"]);
    expect(worker.sent).toEqual([]);

    await vi.advanceTimersByTimeAsync(50);
    expect(worker.sent).toEqual([{ id: 1, type: "check", words: ["recieve", "letter", "today"] }]);
    expect(service.check("recieve")).toBe(false);
    expect(service.check("letter")).toBe(true);
    expect(told).toHaveBeenCalled();
  });

  it("does not ask twice about a word it is already checking or knows", async () => {
    vi.useFakeTimers();
    const worker = fakeWorker({});
    const service = new SpellService(() => worker.transport, memoryStorage());
    service.request(["one"]);
    await vi.advanceTimersByTimeAsync(50);
    service.request(["one", "two"]);
    await vi.advanceTimersByTimeAsync(50);
    expect(worker.sent.map((message) => message.words)).toEqual([["one"], ["two"]]);
  });

  it("finds suggestions", async () => {
    const worker = fakeWorker({ teh: ["the", "ten"] });
    const service = new SpellService(() => worker.transport, memoryStorage());
    await expect(service.suggest("teh")).resolves.toEqual(["the", "ten"]);
  });

  it("keeps added words in this browser, and tells a new worker about them", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const first = fakeWorker({ forkleaf: [] });
    const service = new SpellService(() => first.transport, storage);
    service.request(["forkleaf"]);
    await vi.advanceTimersByTimeAsync(50);
    expect(service.check("forkleaf")).toBe(false);

    service.learn("ForkLeaf");
    expect(service.check("forkleaf")).toBe(true);
    expect(service.check("Forkleaf")).toBe(true);
    expect(JSON.parse(storage.data["forkleaf:spelling:words"]!)).toEqual(["forkleaf"]);

    const second = fakeWorker({});
    const reopened = new SpellService(() => second.transport, storage);
    expect(reopened.check("forkleaf")).toBe(true);
    reopened.request(["anything"]);
    await vi.advanceTimersByTimeAsync(50);
    expect(second.sent[0]).toEqual({ type: "add", words: ["forkleaf"] });
    expect(reopened.words).toEqual(["forkleaf"]);
  });

  it("forgets an added word", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage({ "forkleaf:spelling:words": '["teh"]' });
    const service = new SpellService(() => fakeWorker({ teh: [] }).transport, storage);
    expect(service.check("teh")).toBe(true);
    service.forget("teh");
    expect(service.check("teh")).toBeUndefined();
    expect(storage.data["forkleaf:spelling:words"]).toBe("[]");
  });

  it("ignores a word until the page is reloaded", () => {
    const storage = memoryStorage();
    const service = new SpellService(() => fakeWorker({ teh: [] }).transport, storage);
    service.ignore("teh");
    expect(service.check("teh")).toBe(true);
    expect(new SpellService(() => null, storage).check("teh")).toBeUndefined();
  });

  it("stops asking once the dictionary has failed to load, and says why", async () => {
    vi.useFakeTimers();
    const transport: SpellTransport = {
      onmessage: null,
      postMessage(message) {
        const data = message as { id: number };
        queueMicrotask(() =>
          transport.onmessage?.({
            data: {
              id: data.id,
              type: "failed",
              message: "The dictionary could not be loaded (404).",
            },
          } as MessageEvent),
        );
      },
    };
    const post = vi.spyOn(transport, "postMessage");
    const service = new SpellService(() => transport, memoryStorage());
    service.request(["word"]);
    await vi.advanceTimersByTimeAsync(50);
    expect(service.failure).toContain("404");
    service.request(["other"]);
    await vi.advanceTimersByTimeAsync(50);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("works with no worker at all, by knowing nothing", async () => {
    vi.useFakeTimers();
    const service = new SpellService(() => null, null);
    service.request(["word"]);
    await vi.advanceTimersByTimeAsync(50);
    expect(service.check("word")).toBeUndefined();
    await expect(service.suggest("word")).resolves.toEqual([]);
  });
});

describe("the dictionary worker, with the real English dictionary", () => {
  it("knows ordinary words, catches misspellings and suggests the right fix", async () => {
    const entry = createRequire(join(process.cwd(), "apps/web/package.json")).resolve(
      "dictionary-en",
    );
    const folder = dirname(entry);
    const files: Record<string, string> = {
      "/dictionaries/en.aff": await readFile(join(folder, "index.aff"), "utf8"),
      "/dictionaries/en.dic": await readFile(join(folder, "index.dic"), "utf8"),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) => new Response(files[url] ?? "", { status: files[url] ? 200 : 404 }),
      ),
    );

    const replies: unknown[] = [];
    const scope = globalThis as unknown as {
      onmessage: ((event: MessageEvent) => Promise<void>) | null;
      postMessage: (message: unknown) => void;
    };
    const originalPost = scope.postMessage;
    scope.postMessage = (message) => void replies.push(message);

    try {
      vi.resetModules();
      await import("./spell.worker");
      await scope.onmessage!({
        data: {
          id: 1,
          type: "check",
          words: ["receive", "recieve", "Teh", "The", "don’t", "Running", "backend", "Repos"],
        },
      } as MessageEvent);
      await scope.onmessage!({ data: { id: 2, type: "suggest", word: "recieve" } } as MessageEvent);
      await scope.onmessage!({ data: { type: "add", words: ["forkleaf"] } } as MessageEvent);
      await scope.onmessage!({
        data: { id: 3, type: "check", words: ["forkleaf"] },
      } as MessageEvent);
    } finally {
      scope.postMessage = originalPost;
      scope.onmessage = null;
      vi.unstubAllGlobals();
    }

    expect(replies[0]).toEqual({
      id: 1,
      type: "checked",
      results: [
        ["receive", true],
        ["recieve", false],
        ["Teh", false],
        ["The", true],
        ["don’t", true],
        ["Running", true],
        ["backend", true],
        ["Repos", true],
      ],
    });
    expect((replies[1] as { suggestions: string[] }).suggestions[0]).toBe("receive");
    expect(replies[2]).toEqual({ id: 3, type: "checked", results: [["forkleaf", true]] });
  }, 30_000);
});
