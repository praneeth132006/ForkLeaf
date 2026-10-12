import { describe, expect, it } from "vitest";
import {
  freshness,
  isRoom,
  leaderboard,
  progressComment,
  readProgress,
  roomBody,
  viewersProgressComment,
  type RoomComment,
} from "./study-room";

const line = (week: number, streak: number, mastered: number, on = "2026-10-12") =>
  progressComment({ week, streak, mastered, cards: 60, on });

const comment = (
  login: string,
  body: string,
  createdAt: string,
  viewerDidAuthor = false,
): RoomComment => ({
  id: `${login}-${createdAt}`,
  body,
  createdAt,
  viewerDidAuthor,
  author: { login, avatarUrl: `https://avatars/${login}` },
});

describe("progress lines", () => {
  it("read well on GitHub and carry their numbers for ForkLeaf", () => {
    const body = line(38, 5, 40);
    expect(body.split("\n")[0]).toBe(
      "Reviewed 38 cards this week · 5-day streak · 40 of 60 cards mastered",
    );
    expect(readProgress(body)).toEqual({
      week: 38,
      streak: 5,
      mastered: 40,
      cards: 60,
      on: "2026-10-12",
    });
  });

  it("say nothing about an ordinary comment or a tampered one", () => {
    expect(readProgress("Hello everyone!")).toBeNull();
    expect(readProgress("<!-- forkleaf:study-progress v1 {not json} -->")).toBeNull();
    expect(
      readProgress(
        '<!-- forkleaf:study-progress v1 {"week":-4,"streak":2.5,"mastered":"x","cards":3,"on":"soon"} -->',
      ),
    ).toEqual({ week: 0, streak: 2, mastered: 0, cards: 3, on: "" });
  });
});

describe("the room", () => {
  it("is the discussion called Study room that ForkLeaf opened", () => {
    expect(isRoom({ title: "Study room", body: roomBody("Biology") })).toBe(true);
    expect(isRoom({ title: "Study room" })).toBe(true);
    expect(isRoom({ title: "Study room", body: "Somebody else's thread" })).toBe(false);
    expect(isRoom({ title: "Questions", body: roomBody("x") })).toBe(false);
  });

  it("ranks members by this week, then streak, then mastery, from their newest line", () => {
    const board = leaderboard([
      comment("ada", line(10, 9, 5), "2026-10-01T00:00:00Z"),
      comment("ada", line(30, 4, 20), "2026-10-11T00:00:00Z"),
      comment("grace", line(30, 7, 10), "2026-10-10T00:00:00Z", true),
      comment("linus", "Good luck all!", "2026-10-10T00:00:00Z"),
      comment("alan", line(5, 1, 50), "2026-10-09T00:00:00Z"),
    ]);
    expect(
      board.map((member) => [member.login, member.week, member.streak, member.isViewer]),
    ).toEqual([
      ["grace", 30, 7, true],
      ["ada", 30, 4, false],
      ["alan", 5, 1, false],
    ]);
  });

  it("finds the viewer's own line to rewrite", () => {
    const comments = [
      comment("me", "hello", "2026-10-01T00:00:00Z", true),
      comment("me", line(1, 1, 1), "2026-10-02T00:00:00Z", true),
      comment("me", line(2, 2, 2), "2026-10-03T00:00:00Z", true),
      comment("you", line(3, 3, 3), "2026-10-04T00:00:00Z"),
    ];
    expect(viewersProgressComment(comments)?.createdAt).toBe("2026-10-03T00:00:00Z");
    expect(viewersProgressComment([comments[3]!])).toBeNull();
  });

  it("says how fresh a line is", () => {
    expect(freshness("2026-10-12", "2026-10-12")).toBe("today");
    expect(freshness("2026-10-11", "2026-10-12")).toBe("yesterday");
    expect(freshness("2026-10-02", "2026-10-12")).toBe("10 days ago");
    expect(freshness("", "2026-10-12")).toBe("");
  });
});
