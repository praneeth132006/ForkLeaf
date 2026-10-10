// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ActivityEntry } from "./live-activity";
import {
  mentions,
  notificationText,
  readNotifyMode,
  shouldNotify,
  writeNotifyMode,
} from "./notify";

afterEach(() => window.localStorage.clear());

const entry = (extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
  v: 1,
  n: 12,
  kind: "comment",
  title: "Rotate keys?",
  by: "ada",
  at: "",
  note: null,
  excerpt: "Monthly.",
  ...extra,
});

const options = (mode: "off" | "mine" | "all", involved: number[] = []) => ({
  mode,
  viewer: "Praneeth",
  involved: (n: number) => involved.includes(n),
});

describe("the notify setting", () => {
  it("is off until chosen, per repository", () => {
    expect(readNotifyMode("me", "notes")).toBe("off");
    writeNotifyMode("me", "notes", "mine");
    expect(readNotifyMode("Me", "Notes")).toBe("mine");
    expect(readNotifyMode("me", "other")).toBe("off");
  });

  it("ignores a stored value it does not know", () => {
    window.localStorage.setItem("forkleaf:notify:me/notes", "loud");
    expect(readNotifyMode("me", "notes")).toBe("off");
  });
});

describe("mentions", () => {
  it("finds an @mention the way GitHub links one", () => {
    expect(mentions("thanks @praneeth!", "Praneeth")).toBe(true);
    expect(mentions("@praneeth: look", "praneeth")).toBe(true);
    expect(mentions("mail me@praneeth.dev", "praneeth")).toBe(false);
    expect(mentions("@praneeth-bot did it", "praneeth")).toBe(false);
    expect(mentions(null, "praneeth")).toBe(false);
  });
});

describe("shouldNotify", () => {
  it("never when off", () => {
    expect(shouldNotify(entry(), options("off"))).toBe(false);
  });

  it("for every new message when everything is wanted", () => {
    expect(shouldNotify(entry(), options("all"))).toBe(true);
    expect(shouldNotify(entry({ kind: "discussion" }), options("all"))).toBe(true);
  });

  it("only for threads you are in, or that name you, when that is what is wanted", () => {
    expect(shouldNotify(entry(), options("mine"))).toBe(false);
    expect(shouldNotify(entry(), options("mine", [12]))).toBe(true);
    expect(shouldNotify(entry({ excerpt: "@praneeth thoughts?" }), options("mine"))).toBe(true);
  });

  it("never for your own messages, or for edits, deletions and answers", () => {
    expect(shouldNotify(entry({ by: "praneeth" }), options("all"))).toBe(false);
    for (const kind of ["edited", "deleted", "answered", "locked"] as const) {
      expect(shouldNotify(entry({ kind }), options("all"))).toBe(false);
    }
  });
});

describe("notificationText", () => {
  it("says who did what, where", () => {
    expect(notificationText(entry())).toEqual({
      title: "@ada wrote in “Rotate keys?”",
      body: "Monthly.",
    });
    expect(notificationText(entry({ kind: "reply" })).title).toBe("@ada replied in “Rotate keys?”");
    expect(notificationText(entry({ kind: "discussion", by: null, excerpt: null }))).toEqual({
      title: "Somebody started “Rotate keys?”",
      body: "",
    });
  });
});
