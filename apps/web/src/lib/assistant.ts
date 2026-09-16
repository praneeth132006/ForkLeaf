/**
 * The model behind the assistant panel.
 *
 * ForkLeaf already lets an assistant reach your notes from the outside, over
 * MCP: you connect Claude Code or Cursor and it reads and writes the notebook
 * through GitHub. That is the right shape for an agent doing work on your
 * behalf, and the wrong shape for the thing people actually ask for most —
 * a model beside the note, reading the paragraph they are looking at, while
 * they write. Leaving to another app to ask a question about the sentence
 * under the cursor is the whole friction.
 *
 * So this is the other half: the browser talks to the model directly.
 *
 * Directly is the important word. There is no ForkLeaf API key, no ForkLeaf
 * proxy, and no ForkLeaf server in the path — the key is the reader's own, it
 * is kept in this browser, and the request goes from this page to the provider
 * they chose. That keeps the promise the rest of the app makes (your notes are
 * yours, and the parts of them that leave are the parts you sent) and it also
 * means self-hosting a model on `localhost` is not a special case: it is just
 * another base URL.
 *
 * The cost of talking to four providers from one page is that each speaks its
 * own dialect. `buildRequest` and `readDelta` are where the dialects live, and
 * they are pure functions on purpose, so the difference between Anthropic's
 * `content_block_delta` and OpenAI's `choices[0].delta.content` is testable
 * without a network.
 */

export type ProviderId = "anthropic" | "openai" | "google" | "compatible";

export interface Provider {
  id: ProviderId;
  label: string;
  /** One line under the name in the picker. */
  blurb: string;
  /** Where a reader without a key goes to get one. */
  keyUrl: string;
  /** What the key looks like, so a wrong paste is obvious before it is sent. */
  keyPrefix?: string;
  baseUrl: string;
  /**
   * True when the address is the reader's to set.
   *
   * Only the OpenAI-compatible entry: Ollama, LM Studio, vLLM and OpenRouter
   * are all the same protocol at different addresses, and collapsing them into
   * one row with an editable address is honest about that rather than
   * pretending to support four products.
   */
  editableBaseUrl?: boolean;
  /** True when a local model needs no key at all. */
  keyOptional?: boolean;
  /** Suggestions, not a menu: the model is a free-text field. */
  models: readonly string[];
}

/**
 * The fallback models are a first guess, and nothing more.
 *
 * Providers retire models faster than an app ships releases, and a hard-coded
 * list is a promise to be wrong by next quarter — which is exactly how this
 * feature broke first: `gemini-2.5-pro` shipped here and Google had already
 * stopped offering it to new keys, so the first question anybody asked came
 * back as an error about a model they never chose.
 *
 * So the real list comes from the provider, over `listModels`, as soon as
 * there is a key to ask with. These are what the field holds before that
 * answer arrives, and what it falls back to if the listing is refused.
 */
export const PROVIDERS: readonly Provider[] = [
  {
    id: "anthropic",
    label: "Claude",
    blurb: "Anthropic, direct from this browser",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
    baseUrl: "https://api.anthropic.com",
    // Exact ids, never date-suffixed: `claude-opus-5`, not `claude-opus-5-2026…`.
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  {
    id: "openai",
    label: "OpenAI",
    blurb: "GPT models, direct from this browser",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4.1-mini"],
  },
  {
    id: "google",
    label: "Gemini",
    blurb: "Google AI Studio, direct from this browser",
    keyUrl: "https://aistudio.google.com/apikey",
    baseUrl: "https://generativelanguage.googleapis.com",
    /**
     * Flash first, and that order is the whole point.
     *
     * The `-latest` aliases rather than a version, because Google moves those
     * forward and they cannot go stale between releases. But the Pro alias was
     * listed first here, so choosing Gemini landed on a Pro model — which a
     * free Google key is refused for, with a quota of exactly zero. Every new
     * Gemini reader walked into a wall on their first question. Flash is the
     * one a free key can actually run, so it is the one offered first.
     */
    models: ["gemini-flash-latest", "gemini-pro-latest"],
  },
  {
    id: "compatible",
    label: "Local or other",
    // The page's own security policy names the addresses it may call, so this
    // is the set that actually works rather than every OpenAI-compatible
    // server that exists: a model on this machine, on any port, or OpenRouter.
    blurb: "Ollama or LM Studio on this machine, or OpenRouter",
    keyUrl: "https://ollama.com/download",
    baseUrl: "http://localhost:11434/v1",
    editableBaseUrl: true,
    keyOptional: true,
    models: ["llama3.2", "qwen2.5", "mistral"],
  },
];

export function provider(id: ProviderId): Provider {
  return PROVIDERS.find((entry) => entry.id === id) ?? PROVIDERS[0];
}

export interface AssistantSettings {
  provider: ProviderId;
  model: string;
  /** Only ever differs from the provider default for the compatible entry. */
  baseUrl: string;
  /**
   * Whether the open note travels with the question.
   *
   * On by default, because a panel beside a note that cannot see the note is a
   * worse chat window than the one in the other tab. Off is a real setting and
   * not a formality: a private journal is exactly the note somebody would want
   * to ask a general question next to without sending it anywhere.
   */
  sendNote: boolean;
}

export const DEFAULT_SETTINGS: AssistantSettings = {
  provider: "anthropic",
  model: "claude-opus-5",
  baseUrl: provider("anthropic").baseUrl,
  sendNote: true,
};

export const SETTINGS_STORAGE_KEY = "forkleaf:assistant";
export const KEY_STORAGE_PREFIX = "forkleaf:assistant:key:";

/**
 * Settings and keys are kept in `localStorage`, and that is worth saying out
 * loud rather than burying — the panel says it too, next to the field.
 *
 * A key there is readable by anything that manages to run script on this
 * origin. The other shapes are worse for this app, not better: a key held only
 * in memory is one a reader retypes every reload, and a key on our server is
 * the thing this feature exists to avoid. The keys are the reader's own,
 * scoped to their own account, and revocable in one click at the provider —
 * which is the mitigation that actually holds.
 *
 * Reading and writing them goes through `useAssistantSettings`, so that a key
 * pasted in one tab is a key the other tab has.
 */
export function parseSettings(raw: string | null): AssistantSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
    const fields = value as Partial<AssistantSettings>;
    const id = PROVIDERS.some((entry) => entry.id === fields.provider)
      ? (fields.provider as ProviderId)
      : DEFAULT_SETTINGS.provider;
    return {
      provider: id,
      model:
        typeof fields.model === "string" && fields.model ? fields.model : provider(id).models[0],
      baseUrl:
        typeof fields.baseUrl === "string" && fields.baseUrl
          ? fields.baseUrl
          : provider(id).baseUrl,
      sendNote: fields.sendNote !== false,
    };
  } catch {
    // A half-written or hand-edited value is not worth a broken panel.
    return DEFAULT_SETTINGS;
  }
}

/** True when this provider is ready to be asked something. */
export function isReady(settings: AssistantSettings, key: string): boolean {
  return (
    Boolean(settings.model.trim()) && (provider(settings.provider).keyOptional || Boolean(key))
  );
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface RequestPlan {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * How much of a note travels with a question.
 *
 * Long enough that an ordinary note goes whole — which is the case that
 * matters, because a summary of the first half of a page is a wrong answer
 * that looks like a right one — and short enough that a pasted book does not
 * silently cost the reader a large request. Past the limit the note is cut and
 * the cut is announced in the prompt, so the model knows it is working from a
 * fragment and can say so.
 */
const CONTEXT_LIMIT = 24_000;

export interface NoteContext {
  title: string;
  content: string;
}

/**
 * The instructions the model gets before the conversation.
 *
 * It is told it is beside a Markdown note in ForkLeaf, because the useful
 * answers here are the ones shaped like something you can paste into the page
 * — and a model that does not know it is writing Markdown writes prose with
 * asterisks in it.
 */
export function systemPrompt(note: NoteContext | null): string {
  const base = [
    "You are the assistant panel inside ForkLeaf, a Markdown notes editor.",
    "You are beside the note the reader is writing, not in a separate chat window.",
    "Answer in Markdown, briefly, and in a form that can be pasted straight into a note.",
    "When you are asked to write or rewrite part of the note, return only that part.",
    "If the note does not contain what is needed to answer, say so rather than inventing it.",
  ].join(" ");

  if (!note) return base;

  const trimmed =
    note.content.length > CONTEXT_LIMIT
      ? `${note.content.slice(0, CONTEXT_LIMIT)}\n\n[The note continues past here and was cut to fit.]`
      : note.content;

  return `${base}\n\nThe open note is "${note.title}". Its current contents:\n\n<note>\n${trimmed}\n</note>`;
}

/**
 * One request, in whichever dialect the chosen provider speaks.
 *
 * Anthropic is asked for direct browser access explicitly. That header exists
 * because a key in a page is usually a mistake — a server's key shipped to
 * every visitor. It is not one here: the key belongs to the person typing, was
 * entered by them on this device, and never reaches us.
 */
export function buildRequest(
  settings: AssistantSettings,
  key: string,
  system: string,
  messages: readonly ChatMessage[],
): RequestPlan {
  const model = settings.model.trim();
  const base = settings.baseUrl.trim().replace(/\/+$/, "");

  if (settings.provider === "anthropic") {
    return {
      url: `${base}/v1/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        system,
        messages: messages.map((message) => ({ role: message.role, content: message.text })),
      }),
    };
  }

  if (settings.provider === "google") {
    return {
      // `alt=sse` is what turns this from a JSON array that arrives all at once
      // into the token-by-token stream the panel is built around.
      url: `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.text }],
        })),
      }),
    };
  }

  // OpenAI, and everything that copied its shape.
  return {
    url: `${base}/chat/completions`,
    headers: {
      "content-type": "application/json",
      // A local model usually wants no key; sending an empty bearer to one that
      // does not check is harmless, and omitting it entirely is what lets
      // Ollama's default configuration answer at all.
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...messages.map((message) => ({ role: message.role, content: message.text })),
      ],
    }),
  };
}

/**
 * The text inside one server-sent event, or "" when it carries none.
 *
 * Every provider sends events that are not text — openings, stop reasons,
 * usage, keep-alives — and the panel's job is to append text and ignore the
 * rest. Anything unparseable is treated as one of those rather than as an
 * error, because a stream that dies on an unfamiliar event field is a stream
 * that breaks the week a provider adds one.
 */
export function readDelta(id: ProviderId, data: string): string {
  if (!data || data === "[DONE]") return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return "";
  }
  if (!parsed || typeof parsed !== "object") return "";
  const event = parsed as Record<string, unknown>;

  if (id === "anthropic") {
    if (event.type !== "content_block_delta") return "";
    const delta = event.delta as { text?: unknown } | undefined;
    return typeof delta?.text === "string" ? delta.text : "";
  }

  if (id === "google") {
    const candidates = event.candidates as
      { content?: { parts?: { text?: unknown }[] } }[] | undefined;
    const parts = candidates?.[0]?.content?.parts ?? [];
    return parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
  }

  const choices = event.choices as { delta?: { content?: unknown } }[] | undefined;
  const content = choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : "";
}

/**
 * What kind of thing went wrong, because the advice differs completely.
 *
 * The distinction that matters most is `quota` against `rate`. Both arrive as
 * a 429 and they mean opposite things: one is "you are going too fast", which
 * waiting fixes, and the other is "this key may not use this model at all",
 * which waiting never fixes. Telling somebody to wait a moment when their key
 * has a hard limit of zero is advice that cannot come true.
 */
export type FailureKind =
  "key" | "model" | "quota" | "rate" | "provider" | "request" | "unreachable";

export interface Failure {
  /**
   * Our sentence: what happened, and what to do about it.
   *
   * Kept apart from the provider's own words so the panel can lead with this
   * and fold the rest away. Run together, the line that says what to do was
   * buried under four lines of boilerplate about plans and billing.
   */
  lead: string;
  /** The provider's own words, de-duplicated and trimmed. Often empty. */
  detail: string;
  /** Both, for an `Error` message and for anything that wants one string. */
  message: string;
  kind: FailureKind;
  /** Seconds the provider asked us to wait, when it named a number. */
  retryAfter?: number;
}

/**
 * A failure the panel can act on, rather than only print.
 *
 * Carrying the kind through means the panel can offer the button that fits —
 * choosing a different model against a quota wall, trying again against a rate
 * limit — instead of one apology that fits nothing.
 */
export class AssistantError extends Error {
  readonly kind: FailureKind;
  readonly lead: string;
  readonly detail: string;
  readonly retryAfter?: number;

  constructor(failure: Failure) {
    super(failure.message);
    this.name = "AssistantError";
    this.kind = failure.kind;
    this.lead = failure.lead;
    this.detail = failure.detail;
    this.retryAfter = failure.retryAfter;
  }
}

/**
 * Providers repeat themselves, at length.
 *
 * Google's quota refusal arrives as the same sentence four times over, joined
 * by asterisks, and pasting it whole produced a panel that was more error than
 * answer — a wall of red where an answer should be. The parts are split,
 * de-duplicated in the order they arrived, and cut to something a person will
 * actually read: the first one carries the meaning and the rest repeat it.
 */
export function tidyDetail(detail: string): string {
  const seen = new Set<string>();
  const parts = detail
    .split(/\s*\*\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part || seen.has(part)) return false;
      seen.add(part);
      return true;
    });

  const joined = parts.join(" ");
  if (joined.length <= 240) return joined;
  // Cut at a word rather than mid-word, and show that it was cut.
  const cut = joined.slice(0, 240);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[.,;:]$/, "")}…`;
}

/**
 * What went wrong, said in the second person, with something to do about it.
 *
 * The provider's own words are kept: "check your plan and billing details" is
 * the answer and no wording of ours improves on it. What we add is the part
 * the provider cannot know — which of the things a reader can act on here this
 * actually is.
 */
export function describeFailure(status: number, body: string, model = ""): Failure {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string };
    const error = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    if (typeof error === "string") detail = error;
  } catch {
    detail = body;
  }

  /**
   * What the provider said, and what we show, are not the same string.
   *
   * Everything below is decided from the whole message and only then trimmed
   * for display. Reading the trimmed one instead is a real trap, and this walked
   * into it: Google's boilerplate about plans and billing fills the first two
   * hundred characters, so the `limit: 0` that distinguishes a plan wall from a
   * queue fell off the end and the wrong advice came back.
   */
  const whole = detail;
  detail = tidyDetail(detail);

  // "Please retry in 48.883671819s", or a `retryDelay` of "48s".
  const delay =
    /retry (?:in|after) (\d+(?:\.\d+)?)s/i.exec(whole) ??
    /"?retryDelay"?:\s*"?(\d+(?:\.\d+)?)s/i.exec(whole);
  const retryAfter = delay ? Math.ceil(Number(delay[1])) : undefined;

  /**
   * A limit of zero is a plan, not a queue.
   *
   * Google's free keys report exactly this for the Pro models: the request was
   * never going to be allowed, however long you wait. It is the difference
   * between "later" and "not with this key", and only one of those is worth
   * waiting out.
   */
  const noQuota = /limit:\s*0\b/.test(whole);
  const named = model || "that model";

  if (status === 401 || status === 403) {
    return result("key", "The provider would not accept this key.", detail);
  }

  if (status === 404) {
    return result("model", `${named} is not one this key can use. Choose another.`, detail);
  }

  if (status === 429 && noQuota) {
    return result(
      "quota",
      `This key has no quota for ${named}, so waiting will not help: it is a plan limit rather than a queue, and a free key is refused outright for the paid models.`,
      detail,
    );
  }

  if (status === 429) {
    return result(
      "rate",
      retryAfter
        ? `Too many requests for this key just now. Try again in about ${retryAfter} ${retryAfter === 1 ? "second" : "seconds"}.`
        : "Too many requests for this key just now. Try again in a moment.",
      detail,
      retryAfter,
    );
  }

  if (status >= 500) {
    return result("provider", "The provider had an error of its own.", detail);
  }

  return result("request", "The request was refused.", detail);
}

/** One failure, with our sentence and theirs kept apart and also joined. */
function result(kind: FailureKind, lead: string, detail: string, retryAfter?: number): Failure {
  return { kind, lead, detail, message: detail ? `${lead} ${detail}` : lead, retryAfter };
}

/**
 * Where a provider keeps the list of models this key may use.
 *
 * Every one of them has such an endpoint, which makes the whole staleness
 * problem avoidable: the panel can ask, rather than ship an opinion about what
 * exists. It is a plain GET with the same credentials as a question.
 */
export function buildModelsRequest(settings: AssistantSettings, key: string): RequestPlan {
  const base = settings.baseUrl.trim().replace(/\/+$/, "");

  if (settings.provider === "anthropic") {
    return {
      url: `${base}/v1/models?limit=100`,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: "",
    };
  }

  if (settings.provider === "google") {
    return {
      url: `${base}/v1beta/models?pageSize=200`,
      headers: { "x-goog-api-key": key },
      body: "",
    };
  }

  return {
    url: `${base}/models`,
    headers: key ? { authorization: `Bearer ${key}` } : {},
    body: "",
  };
}

/**
 * Model names that could not answer a question if they were chosen.
 *
 * OpenAI's list is everything the key can reach, which includes transcription,
 * speech, embeddings, moderation and image models — offering those in a menu
 * of things to chat with is offering a menu of errors. Anthropic and Google
 * are filtered by what their own listings say instead, which is better
 * evidence than a name.
 */
const NOT_FOR_CHAT =
  /^(text-|whisper|tts-|dall-e|omni-moderation|davinci|babbage|sora|gpt-image|computer-use|codex-mini)/;

/** The model names in one provider's listing, in the order worth offering. */
export function readModels(id: ProviderId, payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;

  if (id === "google") {
    // Guarded rather than trusted: a listing is a foreign payload like any
    // other, and a provider that answers with the wrong shape should cost the
    // reader a menu, not a crash in the panel.
    const models = Array.isArray(body.models)
      ? (body.models as { name?: unknown; supportedGenerationMethods?: unknown }[])
      : [];
    return models
      .filter((model) => {
        const methods = model.supportedGenerationMethods;
        // Google lists embedding and retrieval models beside the chat ones,
        // and says which is which.
        return Array.isArray(methods) ? methods.includes("generateContent") : true;
      })
      .map((model) => (typeof model.name === "string" ? model.name.replace(/^models\//, "") : ""))
      .filter(Boolean);
  }

  // Anthropic and OpenAI both answer with `data`, newest first for Anthropic.
  const data = Array.isArray(body.data) ? (body.data as { id?: unknown }[]) : [];
  const names = data.map((model) => (typeof model.id === "string" ? model.id : "")).filter(Boolean);

  return id === "anthropic" ? names : names.filter((name) => !NOT_FOR_CHAT.test(name)).sort();
}

/**
 * Which of a key's models to choose when the reader has not chosen one.
 *
 * Being on the list is not the same as being usable. Google lists its Pro
 * models to every key including the free ones, which are then refused with a
 * quota of exactly zero — so picking the first name in the listing picked the
 * one model most likely to fail, and the reader met a wall of red on a model
 * they never chose. The Flash models are the ones a free Google key can
 * actually run, so they are preferred when we are the ones deciding.
 *
 * Only when we are deciding. A name the reader picked is never second-guessed.
 */
export function preferredModel(id: ProviderId, names: readonly string[]): string {
  if (names.length === 0) return "";
  if (id === "google") {
    return names.find((name) => /flash/i.test(name)) ?? names[0];
  }
  return names[0];
}

/**
 * Another model to try, when the one in hand has just been refused.
 *
 * Being told "choose another model" is only useful next to one worth choosing.
 * Without this the reader is sent to a menu to guess again, on a provider
 * whose listing cheerfully includes every model their key is *not* allowed to
 * run — which is how they got here.
 */
export function alternativeTo(id: ProviderId, model: string, listed: readonly string[]): string {
  const pool = (listed.length > 0 ? listed : provider(id).models).filter((name) => name !== model);
  return preferredModel(id, pool);
}

export interface ListOptions {
  settings: AssistantSettings;
  key: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Asks the provider what this key may use.
 *
 * Failure is not an error worth showing. A provider that will not list its
 * models can still answer questions — a local server often has no listing at
 * all — so the panel keeps the typed name and says nothing.
 */
export async function listModels(options: ListOptions): Promise<string[]> {
  const { settings, key } = options;
  const call = options.fetchImpl ?? fetch;
  const plan = buildModelsRequest(settings, key);

  try {
    const response = await call(plan.url, { headers: plan.headers, signal: options.signal });
    if (!response.ok) return [];
    return readModels(settings.provider, await response.json());
  } catch {
    return [];
  }
}

export interface StreamOptions {
  settings: AssistantSettings;
  key: string;
  note: NoteContext | null;
  messages: readonly ChatMessage[];
  onDelta: (text: string) => void;
  signal: AbortSignal;
  /** Swappable so the tests need no network. */
  fetchImpl?: typeof fetch;
}

/**
 * Asks, and calls back with the answer as it arrives.
 *
 * Streaming rather than waiting for the whole reply is not decoration. The
 * panel is beside a note somebody is writing in, and a blank rectangle for
 * fifteen seconds is indistinguishable from a broken one — the first token is
 * the only proof the thing is working that arrives fast enough to matter.
 */
export async function streamChat(options: StreamOptions): Promise<void> {
  const { settings, key, note, messages, onDelta, signal } = options;
  const call = options.fetchImpl ?? fetch;
  const plan = buildRequest(settings, key, systemPrompt(settings.sendNote ? note : null), messages);

  let response: Response;
  try {
    response = await call(plan.url, {
      method: "POST",
      headers: plan.headers,
      body: plan.body,
      signal,
    });
  } catch (error: unknown) {
    if (signal.aborted) return;
    // A browser will not tell a page why a cross-origin request failed, so the
    // honest message is the list of things it is: unreachable address, a local
    // server that has not been told to allow this origin, or no network.
    throw new AssistantError(
      result(
        "unreachable",
        `Could not reach ${new URL(plan.url).host}. Check the address, and that the server allows requests from this page.`,
        error instanceof Error && error.message ? error.message : "",
      ),
    );
  }

  if (!response.ok) {
    throw new AssistantError(
      describeFailure(
        response.status,
        await response.text().catch(() => ""),
        settings.model.trim(),
      ),
    );
  }
  if (!response.body) {
    throw new AssistantError(result("provider", "The provider sent a reply with no body.", ""));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // Events arrive split across network chunks, so a partial line is held back
  // rather than parsed — the alternative drops a token every few kilobytes.
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const text = readDelta(settings.provider, line.slice(5).trim());
        if (text) onDelta(text);
      }
    }
  } finally {
    // Stopping mid-answer should actually stop the download, not just stop
    // showing it.
    await reader.cancel().catch(() => undefined);
  }
}
