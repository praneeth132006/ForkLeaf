// @vitest-environment jsdom
import { StrictMode } from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ path: "/editor", search: "note=private.md" }));
const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path,
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/lib/firebase/analytics", () => ({ track }));
vi.mock("@/lib/posthog", () => ({ startPostHog: vi.fn(), postHogIdentify: vi.fn() }));
import { Analytics } from "./Analytics";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("counts routes once under StrictMode and ignores private note navigation", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  const view = render(
    <StrictMode>
      <Analytics />
    </StrictMode>,
  );
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenLastCalledWith("page_view", {
    page_path: "/editor",
    page_query: undefined,
  });
  state.search = "note=another-private.md&ws=private";
  view.rerender(
    <StrictMode>
      <Analytics />
    </StrictMode>,
  );
  expect(track).toHaveBeenCalledTimes(1);
  state.path = "/docs";
  view.rerender(
    <StrictMode>
      <Analytics />
    </StrictMode>,
  );
  expect(track).toHaveBeenCalledTimes(2);
  state.path = "/editor";
  view.rerender(
    <StrictMode>
      <Analytics />
    </StrictMode>,
  );
  expect(track).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(track.mock.calls)).not.toContain("private");
});
