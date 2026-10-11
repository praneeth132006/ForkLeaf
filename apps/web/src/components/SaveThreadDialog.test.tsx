// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { NoteDiscussionDto } from "@forkleaf/github-client";
import { SaveThreadDialog } from "./SaveThreadDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const discussion: NoteDiscussionDto = {
  id: "D_1",
  number: 1,
  title: "Rotating keys",
  url: "",
  locked: false,
  category: "Q&A",
  answerable: true,
  body: "",
  author: { login: "ada", avatarUrl: "", url: "" },
  createdAt: "2026-10-01T00:00:00Z",
  viewerDidAuthor: false,
  notePath: null,
  comments: [
    {
      id: "c1",
      author: { login: "grace", avatarUrl: "", url: "" },
      body: "Monthly.",
      createdAt: "2026-10-01T01:00:00Z",
      url: "",
      isAnswer: true,
      isMinimized: false,
      viewerDidAuthor: false,
      replies: [],
      replyCount: 0,
      canMarkAnswer: false,
      canUnmarkAnswer: false,
    },
  ],
  commentCount: 1,
};

describe("SaveThreadDialog", () => {
  it("says what will be written and where", () => {
    render(
      <SaveThreadDialog discussion={discussion} ai={null} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/1 message from @grace will be written/)).toBeTruthy();
    expect(screen.getByText("conversations/")).toBeTruthy();
  });

  it("offers no summary when no assistant is set up", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(
      <SaveThreadDialog discussion={discussion} ai={null} onSave={onSave} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    });
    expect(onSave).toHaveBeenCalledWith(false);
  });

  it("asks before sending the conversation to a model, and is off until ticked", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(
      <SaveThreadDialog
        discussion={discussion}
        ai={{ name: "Claude" }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByText(/Sends this conversation to Claude with your key/)).toBeTruthy();

    fireEvent.click(box);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    });
    expect(onSave).toHaveBeenCalledWith(true);
  });

  it("says why it could not save, and can be tried again", async () => {
    const onSave = vi.fn().mockResolvedValue("The model did not answer.");
    render(
      <SaveThreadDialog discussion={discussion} ai={null} onSave={onSave} onClose={vi.fn()} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("The model did not answer.");
    expect((screen.getByRole("button", { name: "Save note" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
