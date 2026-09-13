// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { SCHEDULE_PATH, formatSchedule, parseSchedule } from "./flashcards";
import { withHighlight } from "./pdf-highlights";
import {
  RETIRED,
  choose,
  chosenLabel,
  dueReading,
  passageId,
  passagesIn,
  useSpacedReading,
  type PassageSource,
} from "./spaced-reading";

afterEach(cleanup);

const TODAY = "2026-09-13";

const HIGHLIGHTS: PassageSource = {
  path: "papers/attention.highlights.md",
  title: "Highlights — Attention",
  frontmatter: {},
  content: withHighlight("", {
    pdfPath: "papers/attention.pdf",
    title: "Attention",
    citation: {
      quote: "Attention is all you need for sequence transduction",
      prefix: "",
      suffix: "",
      page: 3,
    },
  }),
};

const QUOTE: PassageSource = {
  path: "inbox/quote.md",
  title: "Alan Kay",
  frontmatter: { type: "quote", site: "example.com" },
  content:
    "> The best way to predict the future\n> is to invent it.\n\n— [Alan Kay](https://example.com)\n",
};

const PAGE: PassageSource = {
  path: "inbox/page.md",
  title: "A saved page",
  frontmatter: { type: "page", url: "https://example.com/post" },
  content: "Intro ==this part of the page is worth rereading== and ==too short==.",
};

describe("passagesIn", () => {
  it("reads a PDF's highlights, with the page", () => {
    expect(passagesIn(HIGHLIGHTS)).toEqual([
      expect.objectContaining({
        text: "Attention is all you need for sequence transduction",
        source: "Attention",
        where: "p. 3",
        path: HIGHLIGHTS.path,
        isNew: true,
      }),
    ]);
  });

  it("reads a saved quote as one passage, and a saved page's highlights", () => {
    expect(passagesIn(QUOTE).map((passage) => [passage.text, passage.where])).toEqual([
      ["The best way to predict the future is to invent it.", "example.com"],
    ]);
    expect(passagesIn(PAGE).map((passage) => passage.text)).toEqual([
      "this part of the page is worth rereading",
    ]);
  });

  it("leaves ordinary notes alone", () => {
    expect(
      passagesIn({
        path: "notes/plan.md",
        title: "Plan",
        frontmatter: {},
        content: "An ==important highlight in my own words== here.",
      }),
    ).toEqual([]);
  });
});

describe("choosing what happens to a passage", () => {
  it("brings it back soon, later, or never", () => {
    const soon = choose(undefined, "soon", TODAY);
    expect(soon).toMatchObject({ due: "2026-09-14", interval: 1 });
    expect(chosenLabel(soon)).toBe("Back tomorrow");

    const later = choose(undefined, "later", TODAY);
    expect(later.interval).toBeGreaterThan(soon.interval);
    expect(chosenLabel(later)).toBe(`Back in ${later.interval} days`);

    const done = choose(later, "done", TODAY);
    expect(done.due).toBe(RETIRED);
    expect(chosenLabel(done)).toBe("Won't come back");
  });
});

describe("dueReading", () => {
  const passages = [...passagesIn(HIGHLIGHTS), ...passagesIn(QUOTE), ...passagesIn(PAGE)];
  const [pdf, quote, page] = passages as [
    (typeof passages)[0],
    (typeof passages)[0],
    (typeof passages)[0],
  ];

  it("puts overdue passages first, then new ones, and caps the day", () => {
    const schedule = parseSchedule(
      formatSchedule(
        new Map([
          [page.id, { due: "2026-09-01", interval: 4, ease: 2.5, reps: 1 }],
          [quote.id, { due: "2026-10-01", interval: 20, ease: 2.5, reps: 2 }],
        ]),
      ),
    );
    const today = dueReading(passages, schedule, TODAY);
    expect(today.map((passage) => passage.id)).toEqual([page.id, pdf.id]);
    expect(today[0]!.isNew).toBe(false);
    expect(dueReading(passages, new Map(), TODAY, 2)).toHaveLength(2);
  });

  it("never brings back a passage marked done", () => {
    const schedule = new Map([[pdf.id, { due: RETIRED, interval: 0, ease: 2.5, reps: 1 }]]);
    expect(dueReading(passages, schedule, TODAY).map((passage) => passage.id)).not.toContain(
      pdf.id,
    );
  });
});

describe("useSpacedReading", () => {
  it("loads today's passages and writes a choice into the shared schedule", async () => {
    const other = formatSchedule(
      new Map([["abcdef12", { due: "2026-12-01", interval: 30, ease: 2.5, reps: 4 }]]),
    );
    let file = other;
    const store = {
      allNotes: vi.fn(async () => [HIGHLIGHTS, QUOTE]),
      readNote: vi.fn(async () => file),
      upsertNote: vi.fn(async (_path: string, change: (content: string) => string) => {
        file = change(file);
        return file;
      }),
      openNote: vi.fn(),
    };
    const { result } = renderHook(() => useSpacedReading(store));
    const bridge = result.current!;

    const today = await bridge.load();
    expect(today.map((passage) => passage.source)).toEqual(["Attention", "Alan Kay"]);

    let label = "";
    await act(async () => {
      label = await bridge.choose(today[0]!, "done");
    });
    expect(label).toBe("Won't come back");
    expect(store.upsertNote).toHaveBeenCalledWith(SCHEDULE_PATH, expect.any(Function));
    const written = parseSchedule(file);
    expect(written.get("abcdef12")).toBeTruthy();
    expect(written.get(passageId(HIGHLIGHTS.path, today[0]!.text))?.due).toBe(RETIRED);

    expect((await bridge.load()).map((passage) => passage.source)).toEqual(["Alan Kay"]);
    bridge.open("inbox/quote.md");
    expect(store.openNote).toHaveBeenCalledWith("inbox/quote.md");
  });

  it("says so when a choice cannot be saved", async () => {
    const store = {
      allNotes: async () => [QUOTE],
      readNote: async () => null,
      upsertNote: async () => null,
      openNote: () => undefined,
    };
    const { result } = renderHook(() => useSpacedReading(store));
    const [passage] = await result.current!.load();
    await expect(result.current!.choose(passage!, "soon")).rejects.toThrow(
      "That could not be saved.",
    );
  });

  it("offers nothing without a notebook", () => {
    const { result } = renderHook(() => useSpacedReading(null));
    expect(result.current).toBeUndefined();
  });
});
