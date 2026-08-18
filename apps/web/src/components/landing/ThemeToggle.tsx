"use client";

import React from "react";
import { useTheme } from "@/hooks/useTheme";

/**
 * Light/dark switch for the marketing pages.
 *
 * The editor has had one since it shipped; the landing page — the first thing
 * anyone sees — did not, which left visitors stuck in whatever their OS
 * preferred. Same `useTheme` store as the editor, so a choice made here is the
 * one they land in.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, , toggleTheme] = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] ${className}`}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

function Sun() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="3.25" />
      <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11 3.05 3.05" />
    </svg>
  );
}

function Moon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 9.8A6.2 6.2 0 0 1 6.2 2a6.25 6.25 0 1 0 7.8 7.8Z" />
    </svg>
  );
}
