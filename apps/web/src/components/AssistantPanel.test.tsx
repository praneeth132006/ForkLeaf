// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssistantPanel } from "./AssistantPanel";

/**
 * Anything React complains about fails the test.
 *
 * React reports a state update made during render as a `console.error` and
 * carries on rendering, which is how this suite passed green while the panel
 * was doing exactly that — the listing effect read one piece of state from
 * inside a `setState` updater and wrote another from there. A warning nobody
 * asserts on is a warning that ships.
 */
const complaints: string[] = [];

beforeEach(() => {
  complaints.length = 0;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    complaints.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  cleanup();
  const seen = [...complaints];
  vi.restoreAllMocks();
  expect(seen).toEqual([]);
});

const NOTE = { title: "Bread", content: "# Bread\n\nBake at 220 degrees." };

/** A key already saved, which is the state most readers are in. */
function withKey() {
  localStorage.setItem("forkleaf:assistant:key:anthropic", "sk-ant-test");
}

/** The models Anthropic reports for a key, when the panel asks. */
function stubModels(...ids: string[]) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ data: ids.map((id) => ({ id })) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Answers every request with a two-event Anthropic stream. */
function stubStream(text: string) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "content_block_delta", delta: { text } })}\n\n`,
            ),
          );
          controller.close();
        },
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * The body of the chat request.
 *
 * Not simply the first call: with a key present the panel also asks the
 * provider which models it has, and that GET carries no body.
 */
function askedWith(fetchMock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const posted = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.body);
  return JSON.parse((posted?.[1] as RequestInit).body as string);
}

async function ask(question: string) {
  fireEvent.change(screen.getByLabelText("Ask the assistant"), { target: { value: question } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  });
}

/**
 * A `localStorage` with the methods a browser has.
 *
 * Node 25 defines an experimental `localStorage` global of its own that
 * shadows jsdom's, and every method on it is missing unless the process was
 * started with a backing file — so the panel's own storage has to be stood up
 * here, the same way `useTheme`'s tests do it.
 */
function installStorage(): void {
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, String(value)),
      removeItem: (key: string) => void entries.delete(key),
      clear: () => entries.clear(),
    },
  });
}

beforeEach(() => {
  installStorage();
  vi.unstubAllGlobals();
});

describe("AssistantPanel", () => {
  it("opens into setup with no key, and gets out of the way once there is one", async () => {
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    const field = await screen.findByLabelText("Claude key");
    expect(screen.getByText(/stays in this browser/)).toBeTruthy();

    fireEvent.change(field, { target: { value: "sk-ant-test" } });

    // The key is kept here, so the next visit is not another setup step — and
    // the form takes itself away rather than waiting to be dismissed.
    expect(localStorage.getItem("forkleaf:assistant:key:anthropic")).toBe("sk-ant-test");
    await waitFor(() => expect(screen.queryByLabelText("Claude key")).toBeNull());
  });

  it("replaces a model the key cannot use with one it can", async () => {
    withKey();
    // The failure this is here for: a model name that was current when the app
    // shipped and has since been retired. Before, the first question came back
    // as an error about a model the reader never chose.
    localStorage.setItem(
      "forkleaf:assistant",
      JSON.stringify({
        provider: "anthropic",
        model: "claude-2.1",
        baseUrl: "https://api.anthropic.com",
      }),
    );
    stubModels("claude-opus-5", "claude-sonnet-5");

    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /claude-2.1|claude-opus-5/ }));

    const picker = (await screen.findByLabelText("Model")) as HTMLSelectElement;
    await waitFor(() => expect(picker.value).toBe("claude-opus-5"));
    expect([...picker.options].map((option) => option.value)).toContain("claude-sonnet-5");
    expect(JSON.parse(localStorage.getItem("forkleaf:assistant") ?? "{}").model).toBe(
      "claude-opus-5",
    );
  });

  it("leaves a model alone when the key can use it", async () => {
    withKey();
    localStorage.setItem(
      "forkleaf:assistant",
      JSON.stringify({
        provider: "anthropic",
        model: "claude-sonnet-5",
        baseUrl: "https://api.anthropic.com",
      }),
    );
    stubModels("claude-opus-5", "claude-sonnet-5");

    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "claude-sonnet-5" }));

    const picker = (await screen.findByLabelText("Model")) as HTMLSelectElement;
    await waitFor(() => expect(picker.tagName).toBe("SELECT"));
    expect(picker.value).toBe("claude-sonnet-5");
  });

  it("still takes a name the provider does not list", async () => {
    withKey();
    stubModels("claude-opus-5");
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /claude/ }));

    // A server with a model its listing does not mention is a real case, so
    // the menu is never the only way to name one.
    fireEvent.click(await screen.findByRole("button", { name: "Type a name instead" }));
    const field = screen.getByLabelText("Model") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "some-private-build" } });

    expect(JSON.parse(localStorage.getItem("forkleaf:assistant") ?? "{}").model).toBe(
      "some-private-build",
    );
    // And it is not overwritten by the listing that already arrived.
    await waitFor(() =>
      expect((screen.getByLabelText("Model") as HTMLInputElement).value).toBe("some-private-build"),
    );
  });

  it("says there is no account sign-in to offer, because there is not", async () => {
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);
    expect(await screen.findByText(/no .sign in with Claude./)).toBeTruthy();
  });

  it("keeps the form open while a different model is being set up", async () => {
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    // A local model needs no key, so the form would otherwise close on the
    // click that chose it — over the address field that is the point of it.
    fireEvent.click(await screen.findByRole("button", { name: "Local or other" }));
    expect(screen.getByLabelText("Address")).toBeTruthy();
  });

  it("sends the note with the question and streams the answer back", async () => {
    withKey();
    const fetchMock = stubStream("Bake it hotter.");
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    await ask("How hot?");

    await waitFor(() => expect(screen.getByText("Bake it hotter.")).toBeTruthy());
    const body = askedWith(fetchMock);
    expect(body.system).toContain("Bake at 220 degrees.");
    expect(body.messages).toEqual([{ role: "user", content: "How hot?" }]);
  });

  it("stops sending the note when that is turned off", async () => {
    withKey();
    const fetchMock = stubStream("Fine.");
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("checkbox"));
    await ask("Anything");

    const body = askedWith(fetchMock);
    expect(body.system).not.toContain("Bake at 220 degrees.");
  });

  it("puts an answer into the note when there is somewhere to put it", async () => {
    withKey();
    stubStream("## Notes on heat");
    const onInsert = vi.fn();
    render(<AssistantPanel note={NOTE} onInsert={onInsert} onClose={vi.fn()} />);

    await ask("Write a heading");

    fireEvent.click(await screen.findByRole("button", { name: "Add to note" }));
    expect(onInsert).toHaveBeenCalledWith("## Notes on heat");
  });

  it("renders an answer as Markdown, and shows the raw text on request", async () => {
    withKey();
    stubStream("## Heading\n\n- one\n- two");
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    await ask("Give me a list");

    // Raw `##` and `*` in the panel read as the model writing badly.
    const heading = await screen.findByRole("heading", { name: "Heading" });
    expect(heading).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    // And the exact characters are one press away, for checking before pasting.
    fireEvent.click(screen.getByRole("button", { name: "Show Markdown" }));
    expect(screen.getByText(/## Heading/)).toBeTruthy();
  });

  it("replaces the note when the answer is the note rewritten", async () => {
    withKey();
    stubStream("# Bread\n\nBake at 230 degrees.");
    const onReplace = vi.fn();
    const onInsert = vi.fn();
    render(
      <AssistantPanel note={NOTE} onInsert={onInsert} onReplace={onReplace} onClose={vi.fn()} />,
    );

    await ask("Tidy the writing");

    // Appending a rewrite leaves the note holding both versions, which is the
    // one outcome nobody asking for a tidy-up wants.
    fireEvent.click(await screen.findByRole("button", { name: "Replace the note" }));
    expect(onReplace).toHaveBeenCalledWith("# Bread\n\nBake at 230 degrees.");
    expect(onInsert).not.toHaveBeenCalled();
  });

  it("says why it cannot write, rather than hiding the buttons", async () => {
    withKey();
    stubStream("Something useful");
    render(
      <AssistantPanel
        note={NOTE}
        cannotWrite="This note is locked. Unlock it — ⌘⇧L — to add answers to it."
        onClose={vi.fn()}
      />,
    );

    await ask("Say something");

    // An absence explains nothing, and reads as the assistant being unable to
    // write to notes at all.
    expect(await screen.findByText(/This note is locked/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add to note" })).toBeNull();
  });

  it("offers no way to add to a note that cannot be written to", async () => {
    withKey();
    stubStream("Something");
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    await ask("Say something");

    await waitFor(() => expect(screen.getByText("Something")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Add to note" })).toBeNull();
  });

  it("explains a refusal and leaves no half-exchange behind", async () => {
    withKey();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }),
      ),
    );
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    await ask("Hello");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("would not accept this key");
    expect(alert.textContent).toContain("bad key");
    expect(screen.getByRole("button", { name: "Check the key" })).toBeTruthy();
    // Neither the question nor the blank reply is left in the thread.
    expect(screen.queryByText("Hello")).toBeNull();
  });

  it("does not stack a second copy of a question that failed", async () => {
    withKey();
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    // What a reader does after an error: ask the same thing again.
    await ask("Summarise this");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    // Never two identical bubbles stacked, and never two consecutive reader
    // turns sent to the model.
    expect(screen.queryAllByText("Summarise this")).toHaveLength(0);
    const asked = fetchMock.mock.calls
      .map((call) => (call[1] as RequestInit | undefined)?.body)
      .filter(Boolean)
      .map((body) => JSON.parse(body as string));
    expect(asked).toHaveLength(2);
    for (const body of asked) {
      expect(body.messages).toEqual([{ role: "user", content: "Summarise this" }]);
    }
  });

  it("offers the model that will work, and asks again on it in one press", async () => {
    // The whole reported failure, end to end: a free Google key, the Pro model
    // ForkLeaf had chosen, and a quota of zero. Being told to "choose another
    // model" sent the reader to a menu to guess again — on a listing that
    // happily includes the models their key may not run.
    localStorage.setItem("forkleaf:assistant:key:google", "AIza-test");
    localStorage.setItem(
      "forkleaf:assistant",
      JSON.stringify({
        provider: "google",
        model: "gemini-pro-latest",
        baseUrl: "https://generativelanguage.googleapis.com",
      }),
    );

    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      const address = String(url);
      if (!(init as RequestInit | undefined)?.body) {
        return Response.json({
          models: [
            { name: "models/gemini-pro-latest", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-flash-latest", supportedGenerationMethods: ["generateContent"] },
          ],
        });
      }
      if (address.includes("gemini-pro-latest")) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro * Please retry in 48.8s.",
            },
          }),
          { status: 429 },
        );
      }
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Flash answered." }] } }] })}\n\n`,
              ),
            );
            controller.close();
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);
    await ask("Summarise this note");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("waiting will not help");
    // Retrying a plan limit is the one thing that cannot work, so it is gone.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    // The alternative is named, not hinted at — and it is the Flash model,
    // which is the one a free Google key can actually run.
    const switcher = await screen.findByRole("button", {
      name: "Use gemini-flash-latest instead",
    });
    await act(async () => {
      fireEvent.click(switcher);
    });

    // One press: switched, asked again, answered.
    await waitFor(() => expect(screen.getByText("Flash answered.")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(JSON.parse(localStorage.getItem("forkleaf:assistant") ?? "{}").model).toBe(
      "gemini-flash-latest",
    );

    const asked = fetchMock.mock.calls
      .filter((call) => (call[1] as RequestInit | undefined)?.body)
      .map((call) => String(call[0]));
    expect(asked[0]).toContain("gemini-pro-latest");
    expect(asked[1]).toContain("gemini-flash-latest");
  });

  it("keeps the provider's own wording, folded away behind the part that matters", async () => {
    withKey();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) =>
        (init as RequestInit | undefined)?.body
          ? new Response(
              JSON.stringify({ error: { message: "Some very long provider explanation." } }),
              { status: 500 },
            )
          : Response.json({ data: [{ id: "claude-opus-5" }] }),
      ),
    );
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    await ask("Anything");

    const alert = await screen.findByRole("alert");
    // Ours leads; theirs is there for anyone who wants it, not shouted.
    expect(alert.querySelector("p")?.textContent).toBe("The provider had an error of its own.");
    expect(alert.querySelector("details")?.textContent).toContain(
      "Some very long provider explanation.",
    );
  });

  it("still offers a choice when the provider lists nothing at all", async () => {
    localStorage.setItem("forkleaf:assistant:key:google", "AIza-test");
    localStorage.setItem(
      "forkleaf:assistant",
      JSON.stringify({
        provider: "google",
        model: "gemini-flash-latest",
        baseUrl: "https://generativelanguage.googleapis.com",
      }),
    );
    // A key that may not list, or a server that will not: the reader used to
    // be told to choose another model and handed an empty text box.
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("nope", { status: 403 })),
    );

    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "gemini-flash-latest" }));

    const picker = (await screen.findByLabelText("Model")) as HTMLSelectElement;
    expect(picker.tagName).toBe("SELECT");
    expect([...picker.options].map((option) => option.value)).toContain("gemini-pro-latest");
  });

  it("puts a failed question back in the box to be reworded", async () => {
    withKey();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 })),
    );
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    await ask("Summarise this badly");
    fireEvent.click(await screen.findByRole("button", { name: "Edit the question" }));

    expect((screen.getByLabelText("Ask the assistant") as HTMLTextAreaElement).value).toBe(
      "Summarise this badly",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps an answer that had started arriving when the connection went", async () => {
    withKey();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        const encoder = new TextEncoder();
        // Delivered, then dropped — `error()` in `start` would discard the
        // chunk with it, which is a different case from a connection that
        // goes after some of the answer has arrived.
        let served = false;
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (served) {
                controller.error(new Error("connection lost"));
                return;
              }
              served = true;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "Half an ans" } })}\n\n`,
                ),
              );
            },
          }),
          { status: 200 },
        );
      }),
    );
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    await ask("Tell me");

    // A partial answer is worth more than a tidy thread.
    await waitFor(() => expect(screen.getByText("Half an ans")).toBeTruthy());
    expect(screen.getByText("Tell me")).toBeTruthy();
  });

  it("says what it can and cannot do with no note open", async () => {
    withKey();
    render(<AssistantPanel note={null} onClose={vi.fn()} />);

    expect(await screen.findByText(/Open a note and the assistant can read it/)).toBeTruthy();
    expect(screen.getByText("No note open")).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  });

  it("remembers the provider, the model and the address", async () => {
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Local or other" }));
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "http://localhost:1234/v1" },
    });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "qwen2.5" } });

    const saved = JSON.parse(localStorage.getItem("forkleaf:assistant") ?? "{}");
    expect(saved).toMatchObject({
      provider: "compatible",
      baseUrl: "http://localhost:1234/v1",
      model: "qwen2.5",
    });
  });
});
