// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { McpConsent } from "./McpConsent";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A signed-in person with two repositories, and the authorize call recorded. */
function signedIn() {
  const posted: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/session") {
        return Response.json({ mode: "github", githubAvailable: true, user: { login: "ada" } });
      }
      if (url === "/api/gh/repos") {
        return Response.json({
          repos: [
            {
              owner: "ada",
              name: "notes",
              fullName: "ada/notes",
              private: true,
              canPush: true,
              updatedAt: "2026-10-02",
            },
            {
              owner: "ada",
              name: "work",
              fullName: "ada/work",
              private: true,
              canPush: true,
              updatedAt: "2026-10-01",
            },
          ],
        });
      }
      posted.push(JSON.parse(String(init?.body)));
      // No URL back, so the page stays put instead of navigating away.
      return Response.json({ error: { message: "stop here" } }, { status: 400 });
    }),
  );
  render(
    <McpConsent
      query="client_id=x"
      clientName="Claude"
      redirectUri="https://claude.ai/api/mcp/auth_callback"
      state="s"
    />,
  );
  return posted;
}

describe("the consent screen", () => {
  it("lets the assistant use other repositories by default, and says so", async () => {
    const posted = signedIn();
    const box = (await screen.findByRole("checkbox", {
      name: /Also let it use my other repositories/,
    })) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(screen.getByText(/in your other repositories when you ask it to by name/)).toBeTruthy();

    await screen.findByText("ada/notes");
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ owner: "ada", repo: "notes", allRepositories: true });
  });

  it("keeps it to one repository when that is unticked", async () => {
    const posted = signedIn();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /Also let it use my other repositories/ }),
    );
    expect(screen.queryByText(/in your other repositories/)).toBeNull();
    await screen.findByText("ada/notes");
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ allRepositories: false });
  });
});
