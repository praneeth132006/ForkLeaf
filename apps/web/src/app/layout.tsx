import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/hooks/useTheme";
import { Analytics } from "@/components/Analytics";
import "./globals.css";

/**
 * Instrument Sans is the interface face: a grotesque with slightly narrow
 * proportions, so dense editor chrome stays readable at 12–14px.
 */
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Instrument Serif ships a single weight, which is exactly why it works as a
 * display face — there is no temptation to use it for body copy.
 */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ForkLeaf",
    template: "%s · ForkLeaf",
  },
  description:
    "A local-first Markdown editor with first-class Mermaid diagrams. Your notes live in your own GitHub repository.",
  applicationName: "ForkLeaf",
  // Installable, and — once installed — registered with the operating system
  // as a handler for markdown files. See `app/manifest.ts`.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ForkLeaf", statusBarStyle: "default" },
};

export const viewport = {
  // Matches --fl-bg in each theme so the mobile browser chrome never flashes a
  // colour the page itself does not use.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // The inline script below writes `data-theme` before React hydrates, so
      // the server-rendered markup legitimately differs from the first client
      // paint. Without this, React logs a hydration mismatch every load.
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the saved theme before first paint. Inline and blocking on
            purpose: loading it any later produces a visible flash of the wrong
            palette on every page load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-[var(--fl-bg)] font-sans text-[var(--fl-text)]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
