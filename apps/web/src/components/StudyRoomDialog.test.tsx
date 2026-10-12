// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StudyRoomDialog } from "./StudyRoomDialog";
import { progressComment } from "@/lib/study-room";
import type { StudyRoomDto } from "@/lib/gateway";

afterEach(cleanup);

const line = (week: number, streak: number) =>
  progressComment({ week, streak, mastered: 10, cards: 40, on: "2026-10-11" });

const ROOM: StudyRoomDto = {
  enabled: true,
  url: "https://github.com/ada/bio-deck",
  room: { number: 9, url: "https://github.com/ada/bio-deck/discussions/9" },
  comments: [
    {
      id: "1",
      body: line(20, 3),
      createdAt: "2026-10-11T00:00:00Z",
      viewerDidAuthor: false,
      author: { login: "ada", avatarUrl: "" },
    },
    {
      id: "2",
      body: line(35, 6),
      createdAt: "2026-10-11T00:00:00Z",
      viewerDidAuthor: true,
      author: { login: "me", avatarUrl: "" },
    },
    {
      id: "3",
      body: "Good luck!",
      createdAt: "2026-10-11T00:00:00Z",
      viewerDidAuthor: false,
      author: { login: "grace", avatarUrl: "" },
    },
  ],
};

const mine = { week: 40, streak: 7, mastered: 12, cards: 40, on: "2026-10-12" };

function mount(room: StudyRoomDto = ROOM, share = vi.fn<(progress: unknown) => Promise<void>>(async () => {})) {
  const load = vi.fn(async () => room);
  render(
    <StudyRoomDialog
      onClose={vi.fn()}
      repo="ada/bio-deck"
      signedIn
      load={load}
      progress={async () => mine}
      share={share}
      today="2026-10-12"
    />,
  );
  return { load, share };
}

describe("StudyRoomDialog", () => {
  it("ranks everybody in the room, with the viewer marked", async () => {
    mount();
    const board = await screen.findByTestId("study-board");
    const rows = within(board)
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("@me (you)");
    expect(rows[0]).toContain("35 this week · 6-day streak");
    expect(rows[0]).toContain("yesterday");
    expect(rows[1]).toContain("@ada");
  });

  it("shares the viewer's progress, then reads the room again", async () => {
    const { share, load } = mount();
    fireEvent.click(await screen.findByText("Update my progress"));
    await waitFor(() => expect(share).toHaveBeenCalledWith(mine));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it("invites the first member when there is no room yet", async () => {
    mount({ ...ROOM, room: null, comments: [] });
    expect(await screen.findByText(/There is no study room for this deck yet/)).toBeTruthy();
    expect(await screen.findByText("Share my progress")).toBeTruthy();
  });

  it("says why it cannot share when Discussions is off", async () => {
    mount({ ...ROOM, enabled: false, room: null, comments: [] });
    expect(await screen.findByText(/Discussions is switched off in ada\/bio-deck/)).toBeTruthy();
    expect((screen.getByText("Share my progress") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows what went wrong when sharing fails", async () => {
    mount(
      ROOM,
      vi.fn(async () => Promise.reject(new Error("ForkLeaf is not installed on ada/bio-deck."))),
    );
    fireEvent.click(await screen.findByText("Update my progress"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "ForkLeaf is not installed on ada/bio-deck.",
    );
  });
});
