import { describe, expect, it } from "vitest";
import { publicQuery, publicUrl, scrubEvent } from "./analytics-privacy";

const EDITOR = "https://forkleaf.app/editor?ws=me%2Fnotes&note=journal%2Fdiagnosis.md#top";

describe("addresses sent to analytics", () => {
  it("keeps where the page is and drops which note is open", () => {
    expect(publicUrl(EDITOR)).toBe("https://forkleaf.app/editor");
  });

  it("keeps campaign tags, and only those", () => {
    expect(publicUrl("https://forkleaf.app/?utm_source=hn&note=x.md&utm_campaign=launch")).toBe(
      "https://forkleaf.app/?utm_source=hn&utm_campaign=launch",
    );
    expect(publicQuery("note=secret.md&ws=a")).toBeUndefined();
    expect(publicQuery("utm_medium=email&q=private")).toBe("utm_medium=email");
  });

  it("drops credentials, and gives nothing for what is not an address", () => {
    expect(publicUrl("https://user:pw@forkleaf.app/x")).toBe("https://forkleaf.app/x");
    expect(publicUrl("not a url")).toBeUndefined();
    expect(publicUrl("")).toBeUndefined();
    expect(publicUrl(undefined)).toBeUndefined();
  });
});

describe("PostHog events", () => {
  it("reduces every address PostHog adds on its own", () => {
    const event = scrubEvent({
      event: "$pageleave",
      properties: {
        $current_url: EDITOR,
        $referrer: "https://forkleaf.app/editor?note=a.md",
        $pathname: "/editor",
        page_query: "note=a.md&utm_source=x",
        other: "kept",
      },
      $set_once: { $initial_current_url: EDITOR, $initial_referrer: "$direct" },
    });
    expect(event.properties).toEqual({
      $current_url: "https://forkleaf.app/editor",
      $referrer: "https://forkleaf.app/editor",
      $pathname: "/editor",
      page_query: "utm_source=x",
      other: "kept",
    });
    expect(event.$set_once).toEqual({
      $initial_current_url: "https://forkleaf.app/editor",
      $initial_referrer: "$direct",
    });
    expect(JSON.stringify(event)).not.toContain("diagnosis");
  });

  it("passes a dropped event through", () => {
    expect(scrubEvent(null)).toBeNull();
  });
});
