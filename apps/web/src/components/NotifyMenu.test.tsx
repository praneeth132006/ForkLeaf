// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotifyMenu } from "./NotifyMenu";

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof NotifyMenu>> = {}) {
  const onChange = vi.fn().mockResolvedValue("granted");
  render(<NotifyMenu live="live" mode="off" permission="default" onChange={onChange} {...props} />);
  return { onChange };
}

const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: /Notifications and live updates/ }));

describe("NotifyMenu", () => {
  it("says whether conversations are live", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Notifications and live updates — live" }),
    ).toBeTruthy();
    openMenu();
    expect(screen.getByRole("status").textContent).toContain("arrive as they are posted");
  });

  it("says when it is checking on a timer instead", () => {
    setup({ live: "off" });
    openMenu();
    expect(screen.getByRole("status").textContent).toContain("every 15 seconds");
  });

  it("offers off, threads I'm in, and everything, with the current one chosen", async () => {
    const { onChange } = setup({ mode: "mine" });
    openMenu();
    expect(
      (screen.getByRole("radio", { name: /Threads I'm in/ }) as HTMLInputElement).checked,
    ).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /Everything/ }));
    });
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("says when the browser refuses, and what still works", () => {
    setup({ mode: "all", permission: "denied" });
    openMenu();
    expect(screen.getByRole("alert").textContent).toContain("blocked for this site");
    expect(screen.getByRole("alert").textContent).toContain("still counts new messages");
  });

  it("cannot be turned on in a browser without notifications", () => {
    setup({ permission: "unsupported" });
    openMenu();
    expect((screen.getByRole("radio", { name: /Everything/ }) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("This browser cannot show notifications.")).toBeTruthy();
  });

  it("explains that notifications need live updates the server does not have", () => {
    setup({ live: "off", mode: "all", permission: "granted" });
    openMenu();
    expect(screen.getByText(/need live updates/)).toBeTruthy();
  });

  it("closes with Escape", () => {
    setup();
    openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
  });
});

describe("NotifyMenu placement", () => {
  // Every surface the bell sits on is an `.fl-panel`, which clips its children
  // to its rounded corner. A menu positioned against the bell was therefore
  // cut off rather than overflowing once it was wider than the gap between the
  // bell and that panel's edge — which on a phone is most of the menu.
  it("positions the panel against the window, not inside the clipping panel", () => {
    setup();
    openMenu();
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(panel.className).toContain("fixed");
    expect(panel.className).not.toContain("absolute");
  });

  it("never asks for more width than the window has", () => {
    setup();
    openMenu();
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(panel.className).toContain("w-[min(16rem,calc(100vw-1rem))]");
  });

  it("keeps the panel inside the window on a narrow screen", () => {
    setup();
    openMenu();
    const panel = screen.getByRole("dialog", { name: "Notifications" }) as HTMLElement;
    // jsdom measures everything as zero, so the clamp's floor is what shows:
    // the menu is pinned to the margin rather than to a negative offset.
    expect(panel.style.left).toBe("8px");
    expect(Number.parseInt(panel.style.top, 10)).toBeGreaterThanOrEqual(0);
  });
});
