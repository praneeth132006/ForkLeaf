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

  it("offers no way to add to a note that cannot be written to", async () => {
    withKey();
    stubStream("Something");
    render(<AssistantPanel note={NOTE} onClose={vi.fn()} />);

    await ask("Say something");

    await waitFor(() => expect(screen.getByText("Something")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Add to note" })).toBeNull();
  });

  it("explains a refusal and keeps no empty answer on screen", async () => {
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
    expect(alert.textContent).toContain("refused the key");
    expect(alert.textContent).toContain("bad key");
    // The question stays; the blank reply does not.
    expect(screen.getByText("Hello")).toBeTruthy();
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
