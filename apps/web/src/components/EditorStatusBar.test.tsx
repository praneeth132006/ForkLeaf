// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  render(<EditorStatusBar {...props} />);
  return props;
}

describe("the status bar's AI assistant button", () => {
  it("opens the steps for connecting an assistant over MCP", () => {
    const onConnectAssistant = vi.fn();
    renderBar({ onConnectAssistant });
    const button = screen.getByRole("button", { name: /Connect AI assistant/ });
    expect(button.getAttribute("title")).toContain("MCP");
    fireEvent.click(button);
    expect(onConnectAssistant).toHaveBeenCalledTimes(1);
  });

  it("is not shown when there is nothing to open", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: /Connect AI assistant/ })).toBeNull();
  });
});
