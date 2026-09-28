import { describe, expect, it } from "vitest";
import {
  byDay,
  notesSent,
  parseReceipts,
  shortQuestion,
  withReceipt,
  type Receipt,
} from "./ai-receipts";

const receipt = (at: string, path: string | null, title = "Note"): Receipt => ({
  at,
  provider: "Claude",
  model: "claude-opus-5",
  host: "api.anthropic.com",
  purpose: "Assistant",
  note: path === null ? null : { title, path, characters: 10 },
  question: "q",
});

describe("ai receipts", () => {
  it("keeps the newest first and at most 500", () => {
    let list: Receipt[] = [];
    for (let i = 0; i < 510; i += 1)
      list = withReceipt(list, receipt(`2026-09-28T00:00:${i}`, null));
    expect(list).toHaveLength(500);
    expect(list[0]!.at).toBe("2026-09-28T00:00:509");
  });

  it("reads back only well-formed receipts", () => {
    expect(
      parseReceipts(JSON.stringify([receipt("2026-09-28T10:00:00Z", "a.md"), { at: 3 }])),
    ).toHaveLength(1);
    expect(parseReceipts("not json")).toEqual([]);
    expect(parseReceipts(null)).toEqual([]);
  });

  it("groups by day and counts the notes sent most", () => {
    const list = [
      receipt("2026-09-28T10:00:00Z", "a.md", "A"),
      receipt("2026-09-28T09:00:00Z", "a.md", "A"),
      receipt("2026-09-27T09:00:00Z", "b.md", "B"),
      receipt("2026-09-27T08:00:00Z", null),
    ];
    expect(byDay(list).map((group) => [group.day, group.receipts.length])).toEqual([
      ["2026-09-28", 2],
      ["2026-09-27", 2],
    ]);
    expect(notesSent(list)).toEqual([
      { title: "a.md", count: 2 },
      { title: "b.md", count: 1 },
    ]);
  });

  it("keeps only the start of a long question", () => {
    expect(shortQuestion("x".repeat(300))).toHaveLength(120);
    expect(shortQuestion("  two\n words ")).toBe("two words");
  });
});
