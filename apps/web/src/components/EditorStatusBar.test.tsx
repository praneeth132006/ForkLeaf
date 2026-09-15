// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EditorStatusBar, type EditorStatusBarProps } from "./EditorStatusBar";

afterEach(cleanup);

function renderBar(over: Partial<EditorStatusBarProps> = {}) {
  const props = {
    sync: {
      status: "local",
      pendingCount: 0,
      blockedCount: 0,
      conflicts: [],
      lastError: null,
      lastErrorCode: null,
      lastErrorDetail: null,
      lastSyncedAt: null,
      mode: "auto",
    },
    workspace: null,
    notePath: null,
    cursor: null,
    words: 0,
    syncPreference: { mode: "auto" },
    onSyncModeChange: vi.fn(),
    onSyncNow: vi.fn(),
    onShowConflicts: vi.fn(),
    onSwitchBranch: vi.fn(),
    onPropose: vi.fn(),
    onSignIn: vi.fn(),
    onDiscardChange: vi.fn(),
    onShrinkChange: vi.fn(),
    onLocateChange: vi.fn(),
    ...over,
  } as unknown as EditorStatusBarProps;
  const view = render(<EditorStatusBar {...props} />);
  return { props, ...view };
}

const DEEP =
  "PRACTICAL ETHICAL HACKING/18. Finding and exploiting web vulnerabilities/18.6 Authentication attacks/18.6.1-brute-force.md";

describe("the status bar", () => {
  it("no longer carries the AI assistant button, which lives in help", () => {
    renderBar({ notePath: DEEP });
    expect(screen.queryByRole("button", { name: /Connect AI assistant/ })).toBeNull();
  });

  it("stays one line tall however long the path is", () => {
    const { container } = renderBar({ notePath: DEEP, words: 22 });
    const footer = container.querySelector("footer")!;

    expect(footer.className).toContain("h-8");
    expect(footer.className).toContain("overflow-hidden");
    expect(footer.className).toContain("whitespace-nowrap");
  });

  it("gives the path a fixed allowance and the whole path as its title", () => {
    renderBar({ notePath: DEEP });
    const path = screen.getByTitle(DEEP);

    expect(path.className).toContain("fl-marquee");
    expect(path.className).toMatch(/max-w-\[/);
  });
});
