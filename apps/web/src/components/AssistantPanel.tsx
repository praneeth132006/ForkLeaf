"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PROVIDERS,
  isReady,
  listModels,
  provider,
  streamChat,
  type ChatMessage,
  type ProviderId,
} from "@/lib/assistant";
import { useAssistantKey, useAssistantSettings } from "@/hooks/useAssistant";

/**
 * The assistant, beside the note.
 *
 * The same shape as the chat panel in an editor people already use every day:
 * a column on the right, the note it can see named at the bottom, and every
 * answer one button away from being part of the page. What it is not is a
 * dialog — a model you have to open, ask, read and close is one you consult,
 * and the point of the column is that you write with it open.
 *
 * It is the reader's own key and the reader's own provider. ForkLeaf has no
 * model of its own to sell, no key of ours to meter, and nothing in the middle
 * of the request; a notebook that keeps your notes in your own repository has
 * no business routing your questions through someone else's server. The price
 * of that is a setup step, which is why the panel opens straight into it and
 * asks for one key rather than an account.
 */

export interface AssistantPanelProps {
  /** The open note, or null when no note is open. */
  note: { title: string; content: string } | null;
  /**
   * Adds an answer to the end of the open note.
   *
   * Absent when there is nowhere to put it — no note, or a locked one — which
   * removes the button rather than leaving one that explains itself after the
   * click.
   */
  onInsert?: (markdown: string) => void;
  onClose: () => void;
}

/** Openers that only make sense with a note, and read as things you would ask. */
const STARTERS = [
  { label: "Summarise this note", prompt: "Summarise this note in five bullet points." },
  {
    label: "What is missing?",
    prompt: "What questions does this note raise but not answer? List them briefly.",
  },
  {
    label: "Tidy the writing",
    prompt: "Rewrite this note more clearly, keeping every fact and all the headings.",
  },
  {
    label: "Make study questions",
    prompt: "Write eight short questions and answers from this note, as a Markdown list.",
  },
];

export function AssistantPanel({ note, onInsert, onClose }: AssistantPanelProps) {
  const [settings, update] = useAssistantSettings();
  const [key, setKey] = useAssistantKey(settings.provider);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const thread = useRef<HTMLDivElement | null>(null);

  const ready = isReady(settings, key);

  /**
   * Whether the setup form is showing.
   *
   * Derived rather than stored until somebody says otherwise: a reader with no
   * key has nothing to do but set one up, and a reader with a key wants the
   * conversation. `null` is "nobody has decided", which is the state the panel
   * opens in and stays in until the header button or a failure decides for it.
   */
  const [setupChoice, setSetupChoice] = useState<boolean | null>(null);
  const showSetup = setupChoice ?? !ready;

  /**
   * The models this key may actually use, asked of the provider.
   *
   * Stored with the provider and address they came from, and read back only
   * when those still match, so switching provider cannot leave the previous
   * one's models on screen — and nothing has to remember to clear them.
   *
   * Empty until the answer arrives, and empty for good if the provider will
   * not say: a local server often has no listing, and one that does not is
   * still perfectly able to answer questions.
   */
  const [listed, setListed] = useState<{ from: string; names: string[] }>({
    from: "",
    names: [],
  });
  const listingFor = `${settings.provider} ${settings.baseUrl}`;
  const models = listed.from === listingFor ? listed.names : [];
  /**
   * True while the reader is typing a name that is not in the list.
   *
   * Mirrored into a ref because the listing arrives asynchronously and has to
   * know whether somebody is mid-word without re-running the request every
   * time that changes. Reading it from a `setState` updater instead — which is
   * what this did first — puts the read inside React's render phase, and the
   * write that followed it updated a component while one was rendering.
   */
  const [typingModel, setTypingModel] = useState(false);
  const typingRef = useRef(false);
  const setTyping = useCallback((value: boolean) => {
    typingRef.current = value;
    setTypingModel(value);
  }, []);

  /** Stops any answer still arriving when the panel goes away. */
  useEffect(() => () => abort.current?.abort(), []);

  /**
   * Follows the answer down as it is written.
   *
   * Only when the reader is already at the bottom: yanking the view back down
   * while somebody is scrolled up re-reading an earlier answer is the single
   * most irritating thing a streaming panel can do.
   */
  useEffect(() => {
    const element = thread.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    if (atBottom) element.scrollTop = element.scrollHeight;
  }, [messages]);

  /**
   * Asks the provider what it has, whenever there is a new key or address.
   *
   * This is the fix for the failure that is otherwise guaranteed: a model name
   * shipped in this app is a guess about someone else's catalogue, and the
   * guess goes stale without warning. If the name we are holding is not on the
   * list that comes back, it is replaced with one that is — so the reader
   * never gets to send a question to a model that was retired.
   */
  useEffect(() => {
    if (!key && !provider(settings.provider).keyOptional) return;

    const controller = new AbortController();
    void listModels({
      settings,
      key,
      signal: controller.signal,
    }).then((found) => {
      if (controller.signal.aborted || found.length === 0) return;
      setListed({ from: listingFor, names: found });
      // Not over a name the reader is in the middle of typing themselves.
      if (!typingRef.current && !found.includes(settings.model)) {
        update({ ...settings, model: found[0] });
      }
    });

    return () => controller.abort();
    // The key and `listingFor` — the provider and its address — are what
    // change the answer. The model does not, and listing again on every
    // keystroke in that field would be a request per character.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, listingFor]);

  const send = useCallback(
    async (text: string) => {
      const asked = text.trim();
      if (!asked || streaming) return;
      if (!isReady(settings, key)) {
        setSetupChoice(true);
        return;
      }

      setError(null);
      setDraft("");
      // The empty assistant message is what turns into the answer. It is added
      // now rather than on the first token so the panel visibly starts working
      // the moment the question is sent.
      const history: ChatMessage[] = [...messages, { role: "user", text: asked }];
      setMessages([...history, { role: "assistant", text: "" }]);
      setStreaming(true);

      const controller = new AbortController();
      abort.current = controller;

      try {
        await streamChat({
          settings,
          key,
          note,
          messages: history,
          signal: controller.signal,
          onDelta: (delta) =>
            setMessages((current) => {
              const next = [...current];
              const last = next[next.length - 1];
              if (last?.role === "assistant")
                next[next.length - 1] = { ...last, text: last.text + delta };
              return next;
            }),
        });
      } catch (failure: unknown) {
        setError(failure instanceof Error ? failure.message : "The request failed.");
        // A failed question leaves no empty bubble behind; the question itself
        // stays, so it can be asked again after the key is fixed.
        setMessages((current) =>
          current.length && current[current.length - 1].text === ""
            ? current.slice(0, -1)
            : current,
        );
      } finally {
        setStreaming(false);
        abort.current = null;
      }
    },
    [settings, key, streaming, messages, note],
  );

  const current = provider(settings.provider);

  /**
   * Changing something in the setup form keeps the setup form open.
   *
   * The form shows itself when there is no key and takes itself away when
   * there is one, which is right for the reader who came here to paste a key
   * and wrong for the one picking a different model — choosing "Local or
   * other", which needs no key at all, would otherwise close the form over the
   * address field they were reaching for.
   */
  const editSetup = (next: Parameters<typeof update>[0]) => {
    setSetupChoice(true);
    update(next);
  };

  /**
   * Switching provider brings that provider's own model, address and key.
   *
   * Somebody who has set up both Claude and a model on their laptop is
   * switching between two working configurations, not editing one — carrying
   * the model name across would hand Anthropic a request for `llama3.2`.
   */
  const chooseProvider = (id: ProviderId) => {
    const chosen = provider(id);
    // The old provider's models are not this one's — reading them back is
    // guarded by which provider they came from, so there is nothing to clear.
    setTyping(false);
    editSetup({ ...settings, provider: id, model: chosen.models[0], baseUrl: chosen.baseUrl });
  };

  return (
    <aside className="flex w-full min-w-0 shrink-0 flex-col" aria-label="Assistant">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--fl-border)] px-3">
        <span className="flex-1 truncate text-[13px] font-semibold text-[var(--fl-text)]">
          Assistant
        </span>

        <button
          type="button"
          onClick={() => setSetupChoice(!showSetup)}
          aria-expanded={showSetup}
          title="Model and key"
          className="max-w-[9rem] truncate rounded-full border border-[var(--fl-border)] px-2 py-0.5 text-[11.5px] text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
        >
          {ready ? settings.model : `Set up ${current.label}`}
        </button>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              abort.current?.abort();
              setMessages([]);
              setError(null);
            }}
            title="Start a new conversation"
            aria-label="Start a new conversation"
            className="rounded p-1 text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          title="Hide the assistant"
          aria-label="Hide the assistant"
          className="rounded p-1 text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
        >
          ›
        </button>
      </div>

      {/* ── Setup ────────────────────────────────────────────────────────── */}
      {showSetup && (
        <div className="shrink-0 space-y-3 border-b border-[var(--fl-border)] px-3 py-3 text-[12.5px]">
          <div className="grid grid-cols-2 gap-1.5">
            {PROVIDERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => chooseProvider(entry.id)}
                aria-pressed={settings.provider === entry.id}
                title={entry.blurb}
                className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                  settings.provider === entry.id
                    ? "border-[var(--fl-accent)] text-[var(--fl-text)]"
                    : "border-[var(--fl-border)] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div>
            <span className="mb-1 block text-[11.5px] text-[var(--fl-muted)]">Model</span>
            {/* A list of what this key can use, when the provider has told us,
                and a plain box when it has not. A menu of real models is the
                difference between choosing and guessing — and the guess is
                what broke: a name that was fine when this shipped and had been
                retired by the time anybody typed a question next to it. */}
            {models.length > 0 && !typingModel ? (
              <>
                <select
                  value={settings.model}
                  onChange={(event) => editSetup({ ...settings, model: event.target.value })}
                  aria-label="Model"
                  className="fl-input w-full"
                >
                  {/* A name the reader set by hand is kept in the list even if
                      the provider did not mention it, so choosing it again is
                      possible after looking at the others. */}
                  {!models.includes(settings.model) && (
                    <option value={settings.model}>{settings.model}</option>
                  )}
                  {models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setTyping(true)}
                  className="mt-1 text-[11.5px] text-[var(--fl-muted)] underline hover:text-[var(--fl-text)]"
                >
                  Type a name instead
                </button>
              </>
            ) : (
              <>
                <input
                  value={settings.model}
                  onChange={(event) => {
                    setTyping(true);
                    editSetup({ ...settings, model: event.target.value });
                  }}
                  placeholder={current.models[0]}
                  aria-label="Model"
                  className="fl-input w-full"
                />
                {models.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTyping(false)}
                    className="mt-1 text-[11.5px] text-[var(--fl-muted)] underline hover:text-[var(--fl-text)]"
                  >
                    Choose from {models.length} models instead
                  </button>
                )}
              </>
            )}
          </div>

          {current.editableBaseUrl && (
            <label className="block">
              <span className="mb-1 block text-[11.5px] text-[var(--fl-muted)]">Address</span>
              <input
                value={settings.baseUrl}
                onChange={(event) => editSetup({ ...settings, baseUrl: event.target.value })}
                placeholder={current.baseUrl}
                aria-label="Address"
                className="fl-input w-full"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[11.5px] text-[var(--fl-muted)]">
              {current.label} key{current.keyOptional ? " (not needed for a local model)" : ""}
            </span>
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value.trim())}
              placeholder={current.keyPrefix ? `${current.keyPrefix}…` : "Paste your key"}
              aria-label={`${current.label} key`}
              autoComplete="off"
              spellCheck={false}
              className="fl-input w-full font-mono text-[12px]"
            />
          </label>

          <p className="leading-snug text-[var(--fl-muted)]">
            The key stays in this browser and questions go straight from this page to{" "}
            {current.label}. Nothing passes through ForkLeaf.{" "}
            <a
              href={current.keyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[var(--fl-accent)] underline"
            >
              Get a key
            </a>
            .
          </p>

          {/* The question everybody asks on seeing this field, answered here
              rather than left to be discovered. None of the three providers
              lets another app use somebody's ChatGPT, Claude or Gemini
              subscription — there is no sign-in to offer, and saying so is
              better than a "Sign in" button that could only ever fail. */}
          {!current.keyOptional && (
            <p className="leading-snug text-[var(--fl-muted)]">
              There is no &ldquo;sign in with {current.label}&rdquo; to offer: {current.label} does
              not let another app use a personal {current.label} subscription, and a key is the only
              door they open. It is free to create, takes about a minute, and is billed separately
              from any subscription you already pay for.
            </p>
          )}

          {key && (
            <button type="button" onClick={() => setKey("")} className="fl-btn fl-btn-ghost w-full">
              Forget this key
            </button>
          )}
        </div>
      )}

      {/* ── Thread ───────────────────────────────────────────────────────── */}
      <div
        ref={thread}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[13px]"
      >
        {messages.length === 0 && !showSetup && (
          <div className="text-[var(--fl-muted)]">
            <p className="leading-snug">
              {note
                ? `Ask about “${note.title}”, or anything else. The note travels with the question.`
                : "Open a note and the assistant can read it. Until then, ask anything."}
            </p>
            {note && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    onClick={() => void send(starter.prompt)}
                    className="rounded-full border border-[var(--fl-border)] px-2.5 py-1 text-[12px] transition-colors hover:text-[var(--fl-text)]"
                  >
                    {starter.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((message, index) =>
          message.role === "user" ? (
            <div key={index} className="flex justify-end">
              <p className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-[var(--fl-elevated)] px-3 py-1.5 text-[var(--fl-text)]">
                {message.text}
              </p>
            </div>
          ) : (
            <div key={index} className="group">
              {/* Plain text, wrapped where it was written. Rendering the reply
                  as Markdown would hide the very characters somebody is about
                  to paste into a Markdown file — a heading that shows as a
                  heading is a heading you cannot check. */}
              <p className="whitespace-pre-wrap break-words leading-relaxed text-[var(--fl-text)]">
                {message.text}
                {streaming && index === messages.length - 1 && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-[var(--fl-accent)]" />
                )}
              </p>

              {message.text && !(streaming && index === messages.length - 1) && (
                <div className="mt-1 flex gap-1.5 text-[11.5px] text-[var(--fl-muted)]">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(message.text);
                      setCopied(index);
                      setTimeout(() => setCopied(null), 1600);
                    }}
                    className="rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
                  >
                    {copied === index ? "Copied" : "Copy"}
                  </button>
                  {onInsert && (
                    <button
                      type="button"
                      onClick={() => onInsert(message.text)}
                      className="rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
                    >
                      Add to note
                    </button>
                  )}
                </div>
              )}
            </div>
          ),
        )}

        {error && (
          <p role="alert" className="leading-snug text-[var(--fl-danger)]">
            {error}{" "}
            <button
              type="button"
              onClick={() => setSetupChoice(true)}
              className="underline hover:text-[var(--fl-text)]"
            >
              Check the settings
            </button>
          </p>
        )}
      </div>

      {/* ── Composer ─────────────────────────────────────────────────────── */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        className="shrink-0 border-t border-[var(--fl-border)] px-3 py-2.5"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, because this is a chat box and not a document.
            // Shift+Enter is the way to a second line, which is the convention
            // every other one of these uses.
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            void send(draft);
          }}
          rows={2}
          placeholder={ready ? "Ask about this note…" : "Add a key to start"}
          aria-label="Ask the assistant"
          className="fl-input max-h-40 w-full resize-y"
        />

        <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-[var(--fl-muted)]">
          {/* What is being sent, said where the sending happens. A context
              toggle buried in settings is one nobody finds at the moment they
              want it, which is while looking at a note they would rather not
              send. */}
          <label className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              type="checkbox"
              checked={settings.sendNote}
              onChange={(event) => update({ ...settings, sendNote: event.target.checked })}
              disabled={!note}
              className="accent-[var(--fl-accent)]"
            />
            <span className="truncate">{note ? `Send “${note.title}”` : "No note open"}</span>
          </label>

          {streaming ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="fl-btn fl-btn-ghost shrink-0"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              className="fl-btn fl-btn-primary shrink-0 disabled:opacity-60"
            >
              Ask
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
