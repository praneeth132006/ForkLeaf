import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  buildRequest,
  alternativeTo,
  buildModelsRequest,
  describeFailure,
  isReady,
  listModels,
  preferredModel,
  readModels,
  tidyDetail,
  provider,
  readDelta,
  streamChat,
  systemPrompt,
  type AssistantSettings,
  type ChatMessage,
} from "./assistant";

const settingsFor = (id: AssistantSettings["provider"]): AssistantSettings => ({
  ...DEFAULT_SETTINGS,
  provider: id,
  model: "test-model",
  baseUrl: provider(id).baseUrl,
});

const messages: ChatMessage[] = [
  { role: "user", text: "Summarise this" },
  { role: "assistant", text: "It is about bread." },
  { role: "user", text: "Shorter" },
];

describe("buildRequest", () => {
  it("speaks Anthropic's dialect, and asks for browser access", () => {
    const plan = buildRequest(settingsFor("anthropic"), "sk-ant-x", "be brief", messages);
    expect(plan.url).toBe("https://api.anthropic.com/v1/messages");
    expect(plan.headers["x-api-key"]).toBe("sk-ant-x");
    expect(plan.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse(plan.body);
    // The system prompt is its own field here, not a first message.
    expect(body.system).toBe("be brief");
    expect(body.stream).toBe(true);
    expect(body.messages).toHaveLength(3);
  });

  it("puts the system prompt in the message list for OpenAI", () => {
    const plan = buildRequest(settingsFor("openai"), "sk-x", "be brief", messages);
    expect(plan.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(plan.headers.authorization).toBe("Bearer sk-x");
    const body = JSON.parse(plan.body);
    expect(body.messages[0]).toEqual({ role: "system", content: "be brief" });
    expect(body.messages).toHaveLength(4);
  });

  it("renames the assistant role and asks for SSE from Gemini", () => {
    const plan = buildRequest(settingsFor("google"), "key", "be brief", messages);
    expect(plan.url).toContain("/v1beta/models/test-model:streamGenerateContent?alt=sse");
    expect(plan.headers["x-goog-api-key"]).toBe("key");
    const body = JSON.parse(plan.body);
    expect(body.contents.map((entry: { role: string }) => entry.role)).toEqual([
      "user",
      "model",
      "user",
    ]);
  });

  it("omits the bearer for a local model with no key", () => {
    const plan = buildRequest(settingsFor("compatible"), "", "be brief", messages);
    expect(plan.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(plan.headers.authorization).toBeUndefined();
  });

  it("does not double the slash when the address has a trailing one", () => {
    const settings = { ...settingsFor("compatible"), baseUrl: "http://localhost:1234/v1/" };
    expect(buildRequest(settings, "", "", messages).url).toBe(
      "http://localhost:1234/v1/chat/completions",
    );
  });
});

describe("readDelta", () => {
  it("takes text out of each provider's own event shape", () => {
    expect(
      readDelta(
        "anthropic",
        JSON.stringify({ type: "content_block_delta", delta: { text: "he" } }),
      ),
    ).toBe("he");
    expect(readDelta("openai", JSON.stringify({ choices: [{ delta: { content: "he" } }] }))).toBe(
      "he",
    );
    expect(
      readDelta(
        "google",
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "he" }] } }] }),
      ),
    ).toBe("he");
  });

  it("ignores the events that carry no text rather than failing on them", () => {
    expect(readDelta("anthropic", JSON.stringify({ type: "message_start" }))).toBe("");
    expect(readDelta("openai", "[DONE]")).toBe("");
    expect(readDelta("openai", "not json at all")).toBe("");
    expect(readDelta("google", JSON.stringify({ usageMetadata: { totalTokenCount: 9 } }))).toBe("");
    expect(readDelta("anthropic", "")).toBe("");
  });
});

describe("listing the models a key can use", () => {
  it("asks each provider in its own dialect, with the same credentials", () => {
    expect(buildModelsRequest(settingsFor("anthropic"), "sk-ant-x").url).toBe(
      "https://api.anthropic.com/v1/models?limit=100",
    );
    expect(buildModelsRequest(settingsFor("anthropic"), "sk-ant-x").headers["x-api-key"]).toBe(
      "sk-ant-x",
    );
    expect(buildModelsRequest(settingsFor("google"), "k").url).toContain("/v1beta/models?");
    expect(buildModelsRequest(settingsFor("openai"), "sk-x").url).toBe(
      "https://api.openai.com/v1/models",
    );
    // A local server with no key is asked without a bearer, as when chatting.
    expect(buildModelsRequest(settingsFor("compatible"), "").headers.authorization).toBeUndefined();
  });

  it("keeps Anthropic's order, which is newest first", () => {
    const names = readModels("anthropic", {
      data: [{ id: "claude-opus-5" }, { id: "claude-sonnet-5" }],
    });
    expect(names).toEqual(["claude-opus-5", "claude-sonnet-5"]);
  });

  it("drops Google's models that cannot answer a question", () => {
    const names = readModels("google", {
      models: [
        { name: "models/gemini-pro-latest", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
      ],
    });
    // The "models/" prefix goes: it is not part of the name you send.
    expect(names).toEqual(["gemini-pro-latest"]);
  });

  it("drops OpenAI's transcription, image and embedding models", () => {
    const names = readModels("openai", {
      data: [
        { id: "gpt-4.1" },
        { id: "whisper-1" },
        { id: "text-embedding-3-small" },
        { id: "dall-e-3" },
        { id: "gpt-4.1-mini" },
      ],
    });
    expect(names).toEqual(["gpt-4.1", "gpt-4.1-mini"]);
  });

  it("survives a listing it cannot read", () => {
    expect(readModels("openai", null)).toEqual([]);
    expect(readModels("openai", "a string")).toEqual([]);
    expect(readModels("google", { models: "not a list" })).toEqual([]);
    expect(readModels("anthropic", { data: { id: "not a list either" } })).toEqual([]);
    expect(readModels("anthropic", {})).toEqual([]);
  });

  it("says nothing when a provider will not list, rather than failing", async () => {
    const refused = vi.fn<typeof fetch>(async () => new Response("nope", { status: 404 }));
    await expect(
      listModels({ settings: settingsFor("compatible"), key: "", fetchImpl: refused }),
    ).resolves.toEqual([]);

    const unreachable = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      listModels({ settings: settingsFor("compatible"), key: "", fetchImpl: unreachable }),
    ).resolves.toEqual([]);
  });
});

describe("the instructions the model gets", () => {
  it("does not ask for brevity, which only ever made answers thinner", () => {
    const prompt = systemPrompt(null);
    expect(prompt).not.toMatch(/\bbriefly\b/);
    expect(prompt).toContain("depth it deserves");
  });

  it("bans the preamble, which is three lines to delete after every paste", () => {
    expect(systemPrompt(null)).toContain("Never open with a preamble");
  });

  it("asks for the finished text alone when rewriting", () => {
    expect(systemPrompt(null)).toContain("return only the finished text");
  });
});

describe("room for an answer", () => {
  it("gives a rewrite of a long note somewhere to go", () => {
    const body = JSON.parse(buildRequest(settingsFor("anthropic"), "k", "sys", messages).body);
    // 4096 cut thorough answers off mid-sentence, which reads as the model
    // being bad at its job rather than as a ceiling we set.
    expect(body.max_tokens).toBe(8192);

    const google = JSON.parse(buildRequest(settingsFor("google"), "k", "sys", messages).body);
    expect(google.generationConfig.maxOutputTokens).toBe(8192);
  });

  it("leaves an OpenAI-compatible server at its own default", () => {
    // The field that caps these was renamed between model families, and
    // sending the wrong one is a 400 on the models that expect the other.
    const body = JSON.parse(buildRequest(settingsFor("openai"), "k", "sys", messages).body);
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBeUndefined();
  });
});

describe("systemPrompt", () => {
  it("carries the note, and says when it was cut", () => {
    const short = systemPrompt({ title: "Bread", content: "# Bread\n\n220C." });
    expect(short).toContain('The open note is "Bread"');
    expect(short).toContain("220C.");
    expect(short).not.toContain("cut to fit");

    const long = systemPrompt({ title: "Book", content: "x".repeat(30_000) });
    expect(long).toContain("cut to fit");
    expect(long.length).toBeLessThan(26_000);
  });

  it("says nothing about a note when none is being sent", () => {
    expect(systemPrompt(null)).not.toContain("The open note");
  });
});

describe("isReady", () => {
  it("needs a key everywhere but a local model", () => {
    expect(isReady(settingsFor("anthropic"), "")).toBe(false);
    expect(isReady(settingsFor("anthropic"), "sk-ant-x")).toBe(true);
    expect(isReady(settingsFor("compatible"), "")).toBe(true);
    expect(isReady({ ...settingsFor("compatible"), model: "  " }, "")).toBe(false);
  });
});

/**
 * Google's real refusal for a Pro model on a free key, which is the wall of
 * red this was written against: the same sentence four times over, and advice
 * to wait for a limit that is zero and will still be zero tomorrow.
 */
const GOOGLE_QUOTA = JSON.stringify({
  error: {
    message:
      "You exceeded your current quota, please check your plan and billing details. " +
      "For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. " +
      "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro " +
      "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro " +
      "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro " +
      "* Please retry in 48.883671819s.",
  },
});

describe("tidyDetail", () => {
  it("says a repeated sentence once", () => {
    const tidied = tidyDetail("first thing * same line * same line * same line");
    expect(tidied).toBe("first thing same line");
  });

  it("cuts a very long message at a word, and shows that it was cut", () => {
    const tidied = tidyDetail("word ".repeat(200));
    expect(tidied.length).toBeLessThanOrEqual(241);
    expect(tidied.endsWith("…")).toBe(true);
    expect(tidied).not.toContain("wor…");
  });

  it("leaves a short message alone", () => {
    expect(tidyDetail("just this")).toBe("just this");
  });
});

describe("describeFailure", () => {
  it("names the likely cause and repeats what the provider said", () => {
    const refused = describeFailure(
      401,
      JSON.stringify({ error: { message: "invalid x-api-key" } }),
    );
    expect(refused.kind).toBe("key");
    expect(refused.message).toContain("would not accept this key");
    expect(refused.message).toContain("invalid x-api-key");

    expect(describeFailure(404, "{}", "gpt-9").kind).toBe("model");
    expect(describeFailure(404, "{}", "gpt-9").message).toContain(
      "gpt-9 is not one this key can use",
    );
    expect(describeFailure(503, "{}").kind).toBe("provider");
    expect(describeFailure(400, "{}").kind).toBe("request");
  });

  it("tells a plan limit apart from a queue, because waiting only fixes one", () => {
    const quota = describeFailure(429, GOOGLE_QUOTA, "gemini-pro-latest");
    expect(quota.kind).toBe("quota");
    // The advice that used to be given here — "wait a moment and ask again" —
    // could never come true against a limit of zero.
    expect(quota.message).toContain("waiting will not help");
    expect(quota.message).toContain("gemini-pro-latest");
    expect(quota.message).not.toMatch(/Try again in/);
  });

  it("says how long to wait when it is really a queue", () => {
    const busy = describeFailure(
      429,
      JSON.stringify({ error: { message: "Slow down. Please retry in 12.4s." } }),
    );
    expect(busy.kind).toBe("rate");
    expect(busy.retryAfter).toBe(13);
    expect(busy.message).toContain("about 13 seconds");
  });

  it("reads a retryDelay field as well as a sentence", () => {
    const busy = describeFailure(429, JSON.stringify({ error: { message: 'retryDelay: "7s"' } }));
    expect(busy.retryAfter).toBe(7);
  });

  it("does not repeat a provider's sentence four times", () => {
    const quota = describeFailure(429, GOOGLE_QUOTA, "gemini-pro-latest");
    const repeats = quota.message.match(/Quota exceeded for metric/g) ?? [];
    expect(repeats).toHaveLength(1);
    // Short enough to be read rather than scrolled past.
    expect(quota.message.length).toBeLessThan(500);
  });

  it("falls back to the raw body when it is not the usual JSON", () => {
    expect(describeFailure(400, "upstream said no").message).toContain("upstream said no");
  });
});

describe("what a new Gemini reader is given", () => {
  it("offers Flash before Pro, because a free key is refused for Pro", () => {
    // Pro was listed first, so choosing Gemini landed on a model that a free
    // Google key cannot run, and the first question hit a wall.
    expect(provider("google").models[0]).toBe("gemini-flash-latest");
  });
});

describe("alternativeTo", () => {
  it("names a model worth trying instead of the one just refused", () => {
    expect(
      alternativeTo("google", "gemini-pro-latest", ["gemini-pro-latest", "gemini-flash-latest"]),
    ).toBe("gemini-flash-latest");
  });

  it("falls back to what we know when the provider listed nothing", () => {
    // A key that may not list models still deserves a suggestion.
    expect(alternativeTo("google", "gemini-pro-latest", [])).toBe("gemini-flash-latest");
    expect(alternativeTo("anthropic", "claude-opus-5", [])).toBe("claude-sonnet-5");
  });

  it("never suggests the model that just failed", () => {
    expect(alternativeTo("google", "gemini-flash-latest", ["gemini-flash-latest"])).toBe("");
    expect(alternativeTo("openai", "gpt-4.1", ["gpt-4.1", "gpt-4.1-mini"])).toBe("gpt-4.1-mini");
  });
});

describe("preferredModel", () => {
  it("picks a Google model a free key can actually run", () => {
    // Google lists its Pro models to every key and then refuses them with a
    // quota of zero, so taking the first name picked the likeliest failure.
    expect(
      preferredModel("google", ["gemini-pro-latest", "gemini-3.1-pro", "gemini-flash-latest"]),
    ).toBe("gemini-flash-latest");
  });

  it("takes the provider's own first choice everywhere else", () => {
    expect(preferredModel("anthropic", ["claude-opus-5", "claude-sonnet-5"])).toBe("claude-opus-5");
    expect(preferredModel("openai", ["gpt-4.1", "gpt-4.1-mini"])).toBe("gpt-4.1");
    // And falls back to the first name when Google lists no flash model.
    expect(preferredModel("google", ["gemini-pro-latest"])).toBe("gemini-pro-latest");
    expect(preferredModel("google", [])).toBe("");
  });
});

/** A response whose body streams the given chunks, split where a stream would split them. */
function sseResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("streamChat", () => {
  it("emits each delta as it arrives, including across a split line", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"text":"Bread "}}\n\ndata: {"type":"content_bl',
        'ock_delta","delta":{"text":"is good"}}\n\ndata: {"type":"message_stop"}\n\n',
      ]),
    );

    await streamChat({
      settings: settingsFor("anthropic"),
      key: "sk-ant-x",
      note: { title: "Bread", content: "# Bread" },
      messages: [{ role: "user", text: "hi" }],
      onDelta: (text) => seen.push(text),
      signal: new AbortController().signal,
      fetchImpl,
    });

    expect(seen.join("")).toBe("Bread is good");
  });

  it("holds the note back when the reader has turned that off", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => sseResponse([]));
    await streamChat({
      settings: { ...settingsFor("anthropic"), sendNote: false },
      key: "sk-ant-x",
      note: { title: "Diary", content: "a private thing" },
      messages: [{ role: "user", text: "hi" }],
      onDelta: () => undefined,
      signal: new AbortController().signal,
      fetchImpl,
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body.system).not.toContain("a private thing");
  });

  it("explains a refusal rather than throwing the status code", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "no credit" } }), { status: 401 }),
    );

    await expect(
      streamChat({
        settings: settingsFor("openai"),
        key: "sk-x",
        note: null,
        messages: [{ role: "user", text: "hi" }],
        onDelta: () => undefined,
        signal: new AbortController().signal,
        fetchImpl,
      }),
    ).rejects.toThrow(/would not accept this key.*no credit/);
  });

  it("names the host when the request never gets there", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      streamChat({
        settings: settingsFor("compatible"),
        key: "",
        note: null,
        messages: [{ role: "user", text: "hi" }],
        onDelta: () => undefined,
        signal: new AbortController().signal,
        fetchImpl,
      }),
    ).rejects.toThrow(/Could not reach localhost:11434/);
  });

  it("stays quiet when the reader pressed stop", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new DOMException("Aborted", "AbortError");
    });

    await expect(
      streamChat({
        settings: settingsFor("anthropic"),
        key: "sk-ant-x",
        note: null,
        messages: [{ role: "user", text: "hi" }],
        onDelta: () => undefined,
        signal: controller.signal,
        fetchImpl,
      }),
    ).resolves.toBeUndefined();
  });
});
