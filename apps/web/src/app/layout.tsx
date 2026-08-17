import type { Metadata } from "next";
import { Fraunces, Public_Sans, JetBrains_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/hooks/useTheme";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "mdnotion",
    template: "%s · mdnotion",
  },
  description:
    "A local-first Markdown editor with first-class Mermaid diagrams. Your notes live in your own GitHub repository.",
  applicationName: "mdnotion",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // The inline script below writes `data-theme` before React hydrates, so
      // the server-rendered markup legitimately differs from the first client
      // paint. Without this, React logs a hydration mismatch every load.
      suppressHydrationWarning
      className={`${fraunces.variable} ${publicSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the saved theme before first paint. Inline and blocking on
            purpose: loading it any later produces a visible flash of the wrong
            palette on every page load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-[var(--color-paper)] font-sans text-[var(--color-ink)]">
        {children}
      </body>
    </html>
  );
}
