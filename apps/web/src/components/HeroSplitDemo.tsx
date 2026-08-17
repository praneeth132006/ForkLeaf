"use client";

// ─── HeroSplitDemo Component ────────────────────────────────────────────────
// Renders on the landing page hero section. Left pane shows markdown being
// "typed" character by character; right pane renders the corresponding HTML
// preview in real time. Loops every ~10 seconds with a soft pause.

import React, { useEffect, useState, useMemo } from "react";

// ── Demo markdown text that gets typed out character-by-character ──
const DEMO_TEXT = `# Welcome to mdnotion

Your notes live in **your** GitHub repo.
We never store a single line.

- Write in markdown
- See it rendered live
- Commit straight to GitHub

> "Your knowledge base, version-controlled."
`;

// ── Simple markdown-to-HTML converter for the hero demo preview ──
// Only handles the subset of markdown used in DEMO_TEXT
function simpleMarkdownToHtml(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Heading 1: lines starting with "# "
    if (line.startsWith("# ")) {
      const text = line.slice(2);
      result.push(
        '<h1 style="font-family:Fraunces,serif;font-size:1.8em;font-weight:700;margin:0.5em 0 0.3em;color:#22262E">' +
          text +
          "</h1>",
      );
    }
    // Blockquote: lines starting with "> "
    else if (line.startsWith("> ")) {
      const text = line.slice(2);
      result.push(
        '<blockquote style="border-left:3px solid #E8A33D;padding-left:12px;color:#8A93A3;font-style:italic;margin:0.5em 0">' +
          text +
          "</blockquote>",
      );
    }
    // List item: lines starting with "- "
    else if (line.startsWith("- ")) {
      const raw = line.slice(2);
      // Convert **bold** syntax to <strong> tags
      const text = raw.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      result.push('<li style="margin:2px 0;list-style:disc;margin-left:20px">' + text + "</li>");
    }
    // Empty line becomes a line break
    else if (line.trim() === "") {
      result.push("<br/>");
    }
    // Regular paragraph
    else {
      const text = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      result.push('<p style="margin:0.3em 0">' + text + "</p>");
    }
  }

  return result.join("");
}

export function HeroSplitDemo() {
  // ── Track how many characters of DEMO_TEXT have been "typed" so far ──
  const [charIndex, setCharIndex] = useState(0);
  // ── Whether the typing animation is currently active ──
  const [isTyping, setIsTyping] = useState(true);

  // Run the typing animation effect
  useEffect(() => {
    if (!isTyping) return; // Don't run when paused

    const interval = setInterval(() => {
      setCharIndex((prev) => {
        // When we've typed all characters, pause then reset
        if (prev >= DEMO_TEXT.length) {
          setIsTyping(false);
          // After 4 seconds pause, restart the loop
          setTimeout(() => {
            setCharIndex(0);
            setIsTyping(true);
          }, 4000);
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 55); // Type one character every 55ms for natural pace

    return () => clearInterval(interval);
  }, [isTyping]);

  // ── The visible portion of the demo text (characters typed so far) ──
  const visibleText = DEMO_TEXT.substring(0, charIndex);
  // ── Convert visible text to HTML for the preview pane ──
  const previewHtml = useMemo(() => simpleMarkdownToHtml(visibleText), [visibleText]);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row rounded-2xl shadow-2xl shadow-[var(--color-fog)]/10 overflow-hidden border border-[var(--color-chalk)] text-left min-h-[400px]">
      {/* ── Left Pane: Raw Markdown Source ────────────────────────────── */}
      <div className="flex-1 bg-[var(--color-basalt)] text-[var(--color-chalk)] p-6 font-mono text-sm overflow-hidden flex flex-col relative">
        {/* Pane label */}
        <div className="text-[var(--color-mist)] text-xs uppercase tracking-wider mb-4 font-sans font-semibold">
          Raw Source
        </div>
        {/* Typed text with blinking amber cursor */}
        <div className="whitespace-pre-wrap leading-relaxed">
          {visibleText}
          <span className="inline-block w-2 h-5 bg-[var(--color-signal-amber)] animate-pulse ml-0.5 align-middle rounded-sm" />
        </div>
      </div>

      {/* ── Right Pane: Live Rendered Preview ────────────────────────── */}
      <div className="flex-1 bg-[var(--color-paper)] text-[var(--color-ink)] p-6 overflow-auto border-l border-[var(--color-chalk)] relative">
        {/* Pane label */}
        <div className="text-[var(--color-mist)] text-xs uppercase tracking-wider mb-4 font-sans font-semibold">
          Live Preview
        </div>
        {/* Rendered HTML output — dangerouslySetInnerHTML is safe here since we control the input */}
        <div
          className="leading-relaxed text-base"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </div>
  );
}
