"use client";

import { useSyncExternalStore } from "react";

export type DocumentTheme = "light" | "dark";

/**
 * Reads the app's current theme from the `data-theme` attribute on `<html>`.
 *
 * The editor package deliberately doesn't import the host app's theme hook — it
 * should be usable standalone. The DOM attribute is the contract between the
 * two, and it's also what the CSS custom properties key off, so reading it here
 * guarantees rendered diagrams match the surrounding UI.
 */

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};

  // The attribute is set imperatively (by the app's theme toggle and by the
  // no-flash script in the document head), so there is no event to listen for.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return () => observer.disconnect();
}

function getSnapshot(): DocumentTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerSnapshot(): DocumentTheme {
  return "light";
}

export function useDocumentTheme(): DocumentTheme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
