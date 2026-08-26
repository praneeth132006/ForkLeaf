// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TimeTravelPanel } from "./TimeTravelPanel";
import type { RevisionTexts } from "@/hooks/useRevisionTexts";
import type { NoteCommitDto } from "@/lib/gateway";

// The replay's job is transport, measurement and frame selection. Rendering
// markdown is `Preview`'s job and is tested where it lives; pulling the real
// one in would drag mermaid into every one of these tests.
vi.mock("@forkleaf/editor", () => ({
  Preview: ({ markdown }: { markdown: string }) => <pre data-testid="preview">{markdown}</pre>,
}));

afterEach(cleanup);

function commit(sha: string, day: number, extra: Partial<NoteCommitDto> = {}): NoteCommitDto {
  return {
    sha,
    message: `commit ${sha}`,
    authorName: "Ada",
    authorLogin: "ada",
    avatarUrl: null,
    date: `2026-03-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    byForkLeaf: false,
    ...extra,
  };
}

/** A stand-in cache holding text that is already there, with spies on the rest. */
function cache(texts: Record<string, string | null>): RevisionTexts & {
  request: ReturnType<typeof vi.fn>;
  prefetch: ReturnType<typeof vi.fn>;
} {
  return {
    texts,
    has: (sha: string) => sha in texts,
    request: vi.fn(),
    prefetch: vi.fn(),
  };
}

/** Newest first, the way the history API returns commits. */
const COMMITS = [commit("ccc", 3), commit("bbb", 2), commit("aaa", 1)];
const TEXTS = {
  aaa: "one",
  bbb: "one\ntwo",
  ccc: "one\ntwo\nthree",
};

function panel(overrides: Partial<React.ComponentProps<typeof TimeTravelPanel>> = {}) {
  const revisions = overrides.revisions ?? cache(TEXTS);
  const onRestore = vi.fn();
  render(
    <TimeTravelPanel
      commits={COMMITS}
      revisions={revisions}
      workingCopy={TEXTS.ccc}
      onRestore={onRestore}
      {...overrides}
    />,
  );
  return { revisions, onRestore };
}

const slider = () => screen.getByRole("slider") as HTMLInputElement;
const play = () => screen.getByRole("button", { name: /play replay/i });
const pause = () => screen.getByRole("button", { name: /pause replay/i });
const readout = () => screen.getByTestId("preview").textContent;

describe("TimeTravelPanel", () => {
  it("starts at the oldest revision, not the newest", () => {
    panel();
    expect(slider().value).toBe("0");
    expect(readout()).toBe("one");
    expect(screen.getByText("1/3")).toBeTruthy();
  });

  it("asks for every revision up front so playback does not stutter", () => {
    const { revisions } = panel();
    expect(revisions.prefetch).toHaveBeenCalledWith(["ccc", "bbb", "aaa"]);
  });

  it("plays a note forwards through its history", () => {
    panel();
    expect(slider().max).toBe("2");
    fireEvent.change(slider(), { target: { value: "2" } });
    expect(readout()).toBe("one\ntwo\nthree");
    expect(screen.getByText("3/3")).toBeTruthy();
  });

  it("steps one revision at a time with the transport buttons", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: /next revision/i }));
    expect(readout()).toBe("one\ntwo");
    fireEvent.click(screen.getByRole("button", { name: /previous revision/i }));
    expect(readout()).toBe("one");
  });

  it("disables stepping past either end", () => {
    panel();
    expect(screen.getByRole("button", { name: /previous revision/i })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.change(slider(), { target: { value: "2" } });
    expect(screen.getByRole("button", { name: /next revision/i })).toHaveProperty("disabled", true);
  });

  it("reports the words and the line churn of each step", () => {
    panel();
    expect(screen.getByText("1 words")).toBeTruthy();

    fireEvent.change(slider(), { target: { value: "1" } });
    expect(screen.getByText("2 words")).toBeTruthy();
    // One word gained, one line added, none removed. Both "+1"s are on screen,
    // so they are read off the row rather than matched individually.
    const row = screen.getByText("2 words").parentElement!;
    expect(row.textContent).toContain("+1");
    expect(row.textContent).toContain("−0");
  });

  it("shows the shape of the history above the scrubber", () => {
    panel();
    const chart = screen.getByRole("img", { name: /word count across 3 revisions/i });
    expect(chart.querySelector("path")).toBeTruthy();
  });

  it("says so when a revision has not arrived yet, rather than showing a blank page", () => {
    panel({ revisions: cache({ ccc: TEXTS.ccc, bbb: TEXTS.bbb }) });
    expect(screen.getByText(/loading this revision/i)).toBeTruthy();
    expect(screen.queryByTestId("preview")).toBeNull();
  });

  it("says so when a revision could not be read", () => {
    panel({ revisions: cache({ ...TEXTS, aaa: null }) });
    expect(screen.getByText(/could not be read/i)).toBeTruthy();
  });

  it("notes an empty revision instead of rendering nothing", () => {
    panel({ revisions: cache({ ...TEXTS, aaa: "" }) });
    expect(screen.getByText(/note was empty at this point/i)).toBeTruthy();
  });

  it("shows the loading tally while revisions are still coming in", () => {
    panel({ revisions: cache({ ccc: TEXTS.ccc }) });
    expect(screen.getByText("loading 1/3")).toBeTruthy();
  });

  it("lights up the lines a revision introduced in the source view", () => {
    panel();
    fireEvent.change(slider(), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("tab", { name: /source/i }));

    const rendered = screen.getByText("two");
    // The whole document is on screen, with only the new line marked.
    expect(screen.getByText("one")).toBeTruthy();
    expect(rendered.className).toContain("bg-[var(--fl-accent)]/15");
    expect(screen.getByText("one").className).not.toContain("bg-[var(--fl-accent)]/15");
  });

  it("highlights against the last revision it could read, not a gap", () => {
    // Frame two is unreadable, so frame three's additions are measured against
    // frame one — which is what the readout above it already reports.
    panel({ revisions: cache({ aaa: "one", bbb: null, ccc: "one\ntwo\nthree" }) });
    fireEvent.change(slider(), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("tab", { name: /source/i }));

    expect(screen.getByText("two").className).toContain("bg-[var(--fl-accent)]/15");
    expect(screen.getByText("three").className).toContain("bg-[var(--fl-accent)]/15");
    expect(screen.getByText("one").className).not.toContain("bg-[var(--fl-accent)]/15");
  });

  it("shows the opening revision plain rather than lit up end to end", () => {
    panel();
    fireEvent.click(screen.getByRole("tab", { name: /source/i }));
    expect(screen.getByText("one").className).not.toContain("bg-[var(--fl-accent)]/15");
  });

  it("appends the unsaved working copy as a final frame", () => {
    panel({ workingCopy: "one\ntwo\nthree\nfour" });
    expect(slider().max).toBe("3");
    fireEvent.change(slider(), { target: { value: "3" } });
    expect(screen.getByText("working copy")).toBeTruthy();
    expect(readout()).toBe("one\ntwo\nthree\nfour");
  });

  it("does not invent a working-copy frame when the note is saved", () => {
    panel({ workingCopy: TEXTS.ccc });
    expect(slider().max).toBe("2");
  });

  it("does not offer to restore the working copy over itself", () => {
    panel({ workingCopy: "one\ntwo\nthree\nfour" });
    fireEvent.change(slider(), { target: { value: "3" } });
    expect(screen.getByRole("button", { name: /restore this version/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("restores the revision on screen", async () => {
    const { onRestore } = panel();
    fireEvent.change(slider(), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /restore this version/i }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith("one\ntwo"));
  });

  it("locks the controls down to a single frame when there is one commit", () => {
    render(
      <TimeTravelPanel
        commits={[commit("aaa", 1)]}
        revisions={cache({ aaa: "one" })}
        workingCopy="one"
        onRestore={vi.fn()}
      />,
    );
    expect(slider()).toHaveProperty("disabled", true);
    expect(play()).toHaveProperty("disabled", true);
    expect(screen.getByText("1/1")).toBeTruthy();
  });

  it("renders an empty state rather than crashing with no commits", () => {
    render(
      <TimeTravelPanel commits={[]} revisions={cache({})} workingCopy="" onRestore={vi.fn()} />,
    );
    expect(screen.getByText(/nothing to replay yet/i)).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});

describe("TimeTravelPanel playback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it("advances one revision per beat while playing", async () => {
    panel();
    fireEvent.click(play());

    await advance(900);
    expect(slider().value).toBe("1");

    await advance(900);
    expect(slider().value).toBe("2");
  });

  it("stops of its own accord at the newest revision", async () => {
    panel();
    fireEvent.click(play());

    // Beat by beat: a single long jump would land past the point where the
    // next beat gets scheduled, which says nothing about how playback behaves.
    for (let beat = 0; beat < 5; beat += 1) await advance(900);

    expect(slider().value).toBe("2");
    // Back to a play button — nothing left to play.
    expect(play()).toBeTruthy();
  });

  it("plays faster when asked to", async () => {
    panel();
    fireEvent.change(screen.getByLabelText(/speed/i), { target: { value: "4" } });
    fireEvent.click(play());

    await advance(225);
    expect(slider().value).toBe("1");
  });

  it("pauses where it is", async () => {
    panel();
    fireEvent.click(play());
    await advance(900);
    fireEvent.click(pause());
    for (let beat = 0; beat < 4; beat += 1) await advance(900);
    expect(slider().value).toBe("1");
  });

  it("restarts from the beginning when played from the end", async () => {
    panel();
    fireEvent.change(slider(), { target: { value: "2" } });
    fireEvent.click(play());
    // Pressing play at the end rewinds rather than sitting there doing nothing.
    expect(slider().value).toBe("0");
  });

  it("waits for a revision that has not arrived instead of flashing past it", async () => {
    const { revisions } = panel({ revisions: cache({ aaa: "one", ccc: TEXTS.ccc }) });
    fireEvent.click(play());

    await advance(5000);

    // Frame two is missing, so the playhead holds at frame one and asks again.
    expect(slider().value).toBe("0");
    expect(revisions.request).toHaveBeenCalledWith(["bbb"]);
  });

  it("stops playing when the scrubber is dragged", async () => {
    panel();
    fireEvent.click(play());
    fireEvent.change(slider(), { target: { value: "2" } });
    for (let beat = 0; beat < 4; beat += 1) await advance(900);
    expect(slider().value).toBe("2");
    expect(play()).toBeTruthy();
  });

  it("seeks to where the chart is clicked", async () => {
    panel();
    const chart = screen.getByRole("img", { name: /word count across/i });
    chart.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 64 }) as DOMRect;

    fireEvent.pointerDown(chart, { clientX: 100, buttons: 1 });
    expect(slider().value).toBe("2");

    fireEvent.pointerDown(chart, { clientX: 50, buttons: 1 });
    expect(slider().value).toBe("1");
  });
});
