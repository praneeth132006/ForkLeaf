import type { MetadataRoute } from "next";

/**
 * The web app manifest — what makes ForkLeaf installable, and what puts it in
 * the operating system's "Open with" list for markdown files.
 *
 * `file_handlers` is the part that matters. Once ForkLeaf is installed, the
 * browser registers it with the OS as a handler for the file types listed
 * here: `xdg-open note.md` on Linux, "Open with" on Windows and ChromeOS.
 * Double-clicking a `.md` file launches ForkLeaf with a handle to that exact
 * file, which `useLocalFiles` picks up from `window.launchQueue` — so saving
 * writes back to the file on disk rather than to a copy of it.
 *
 * There is deliberately no service worker behind this. ForkLeaf is already
 * offline-capable because every note is written to IndexedDB before anything
 * else happens; a service worker would add a second, staler cache of the app
 * shell and a class of "why am I running last week's build" bugs, in exchange
 * for a cold start that is already fast. Installability does not require one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ForkLeaf",
    short_name: "ForkLeaf",
    description:
      "A local-first Markdown editor with first-class Mermaid diagrams. Your notes live in your own GitHub repository.",
    // Straight into the editor, not the marketing page: an installed app that
    // opens on its own landing page is an app nobody keeps installed.
    start_url: "/editor",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Matches --fl-bg in the light theme, so the splash screen does not flash
    // a colour the app itself never uses.
    background_color: "#fcfcfa",
    theme_color: "#fcfcfa",
    categories: ["productivity", "utilities"],

    /**
     * The types ForkLeaf offers to open.
     *
     * `.mdx` and `.txt` are listed alongside markdown because both are plain
     * text a markdown editor can honestly edit, and because refusing to open a
     * file the user explicitly chose ForkLeaf for is the least helpful thing an
     * editor can do. `text/markdown` is the registered type; `text/x-markdown`
     * is what a good deal of software still sends.
     */
    file_handlers: [
      {
        action: "/editor",
        accept: {
          "text/markdown": [".md", ".markdown", ".mdown", ".mkd"],
          "text/x-markdown": [".md", ".markdown"],
          "text/plain": [".txt", ".text"],
          "text/mdx": [".mdx"],
        },
      },
    ],

    /**
     * Open the file in the window that is already running, rather than a new
     * one each time. Opening four notes should give four tabs in one ForkLeaf,
     * not four ForkLeafs — and a second window would be a second IndexedDB
     * connection racing the first for the same notes.
     */
    launch_handler: { client_mode: "focus-existing" },
    icons: [
      {
        src: "/brand/forkleaf-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/forkleaf-icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/forkleaf-icon-180.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      // Maskable is a separate declaration, not a flag on the ones above: a
      // launcher that crops to a circle will crop an `any` icon's edges off.
      {
        src: "/brand/forkleaf-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "New note", url: "/editor?new=1" },
      { name: "Dashboard", url: "/dashboard" },
    ],
  };
}
