import { describe, expect, it } from "vitest";
import { youtubeVideoFrom, youtubeEmbedUrl, youtubeWatchUrl } from "./youtube";
import { markdownToHtml } from "./render";

describe("youtubeVideoFrom", () => {
  it("reads every shape of link YouTube hands out", () => {
    const forms = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
    ];

    for (const url of forms) {
      expect(youtubeVideoFrom(url), url).toEqual({ id: "dQw4w9WgXcQ" });
    }
  });

  it("keeps the start time, written either way", () => {
    expect(youtubeVideoFrom("https://youtu.be/dQw4w9WgXcQ?t=90")).toEqual({
      id: "dQw4w9WgXcQ",
      start: 90,
    });
    expect(youtubeVideoFrom("https://youtu.be/dQw4w9WgXcQ?t=1m30s")).toEqual({
      id: "dQw4w9WgXcQ",
      start: 90,
    });
  });

  it("refuses a host that merely starts with youtube's", () => {
    expect(youtubeVideoFrom("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeVideoFrom("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeVideoFrom("javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("refuses a link that names no video", () => {
    expect(youtubeVideoFrom("https://www.youtube.com/")).toBeNull();
    expect(youtubeVideoFrom("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeVideoFrom("https://www.youtube.com/@somechannel")).toBeNull();
  });

  it("round trips through the watch URL", () => {
    const video = youtubeVideoFrom("https://youtu.be/dQw4w9WgXcQ?t=42")!;
    expect(youtubeWatchUrl(video)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s");
    expect(youtubeEmbedUrl(video)).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=42",
    );
  });
});

describe("rendering a video", () => {
  it("embeds a link that is a paragraph of its own", () => {
    const html = markdownToHtml("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(html).toContain("<iframe");
    expect(html).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html).toContain('class="fl-embed"');
  });

  it("embeds a written-out link too", () => {
    const html = markdownToHtml("[Never gonna](https://youtu.be/dQw4w9WgXcQ)");
    expect(html).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("leaves a link inside a sentence alone", () => {
    const html = markdownToHtml("See https://youtu.be/dQw4w9WgXcQ for the demo.");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("<a href");
  });

  it("never frames anything but the player", () => {
    // Inline HTML in a note is escaped rather than parsed, and the sanitiser
    // is the second lock on the same door.
    const html = markdownToHtml('<iframe src="https://evil.example/"></iframe>');
    expect(html).not.toContain("evil.example");
  });
});
