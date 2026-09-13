import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./render";

describe("voice notes in rendered markdown", () => {
  it("turns a paragraph that is only a link to a recording into a player", () => {
    const html = markdownToHtml("[Listen](assets/voice.webm)");
    expect(html).toContain(
      '<div class="fl-audio"><audio controls preload="metadata" src="assets/voice.webm"></audio>',
    );
    expect(html).toContain('<a href="assets/voice.webm">Listen</a>');
  });

  it("plays what the resolver makes of the path", () => {
    const html = markdownToHtml("[Listen](../assets/voice.m4a)", {
      resolveImageSrc: (src) => `/api/gh/raw?path=${encodeURIComponent(src)}`,
    });
    expect(html).toContain('src="/api/gh/raw?path=..%2Fassets%2Fvoice.m4a"');
  });

  it("leaves a link that is part of a sentence, or on another site, as a link", () => {
    expect(markdownToHtml("Here is [the memo](assets/voice.webm) from Tuesday.")).not.toContain(
      "<audio",
    );
    expect(markdownToHtml("[Podcast](https://example.com/episode.mp3)")).not.toContain("<audio");
  });

  it("keeps a missing local recording as a link rather than a broken player", () => {
    const html = markdownToHtml("[Listen](assets/voice.webm)", {
      resolveImageSrc: () => "data:image/svg+xml;utf8,missing",
    });
    expect(html).not.toContain("<audio");
    expect(html).toContain('href="assets/voice.webm"');
  });

  it("never plays a link the sanitiser refused", () => {
    const html = markdownToHtml("[Listen](javascript:alert(1)//x.webm)");
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("javascript:");
  });
});
