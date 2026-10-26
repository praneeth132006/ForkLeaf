import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_TAGLINE } from "@/lib/site";

/**
 * The picture a link to ForkLeaf unfurls into — on X, LinkedIn, Slack,
 * Discord, iMessage and every other place a URL gets pasted.
 *
 * Without one, a shared link is a bare grey line of text, which is the single
 * cheapest way to lose a click. Every page inherits this one unless it brings
 * its own.
 */
export const alt = `ForkLeaf — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const mark = await readFile(join(process.cwd(), "public/brand/forkleaf-mark.svg"));
  const markSrc = `data:image/svg+xml;base64,${mark.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(135deg, #0b0f0c 0%, #12201a 100%)",
        color: "#f0f0f0",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <img src={markSrc} width={72} height={72} alt="" />
        <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>ForkLeaf</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
          Notes that outlive the app that made them.
        </span>
        <span style={{ fontSize: 32, color: "#a8b3ab", lineHeight: 1.35 }}>
          Markdown notes stored in your own GitHub repository. Offline-first, real git history, no
          lock-in.
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: 24, color: "#3ecf8e" }}>
        <span>Free</span>
        <span style={{ color: "#4a5a50" }}>·</span>
        <span>Open source</span>
        <span style={{ color: "#4a5a50" }}>·</span>
        <span>forkleaf.in</span>
      </div>
    </div>,
    size,
  );
}
