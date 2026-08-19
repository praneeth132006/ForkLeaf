import type { Workspace } from "@forkleaf/types";

/**
 * The workspace that exists before any repository is connected.
 *
 * Notes written here live in this browser's IndexedDB and nowhere else, which
 * is what makes ForkLeaf usable without a GitHub account at all — and what
 * gives someone who has just signed in somewhere to write while they decide
 * which repository their notes belong in.
 *
 * Defined once and shared, because the editor and the dashboard both create it
 * on first run and two copies with different ids would be two notebooks.
 */
export const LOCAL_WORKSPACE: Workspace = {
  id: "local",
  name: "On this device",
  repo: { owner: "local", repo: "local", branch: "local", directory: "" },
  isDefault: true,
  isLocal: true,
  createdAt: new Date(0).toISOString(),
  lastOpenedAt: new Date(0).toISOString(),
};
