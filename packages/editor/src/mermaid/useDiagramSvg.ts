"use client";

import { useEffect, useState } from "react";
import { renderDiagram, LIGHT_THEME, DARK_THEME, type DiagramError } from "@forkleaf/diagrams";
import { useDocumentTheme } from "../useDocumentTheme";

/**
 * Renders mermaid source to SVG, debounced.
 *
 * Keeps the last successfully rendered diagram on screen while the source is
 * temporarily invalid — otherwise the canvas flickers empty on every keystroke,
 * which makes editing a diagram feel broken.
 */
export function useDiagramSvg(
  code: string,
  /** Omit to follow the app's current theme. */
  theme?: "light" | "dark",
  debounceMs = 300,
): { svg: string | null; error: DiagramError | null; pending: boolean } {
  const documentTheme = useDocumentTheme();
  const resolved = theme ?? documentTheme;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<DiagramError | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!code.trim()) {
      setSvg(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setPending(true);

    const timer = setTimeout(async () => {
      const result = await renderDiagram(code, resolved === "dark" ? DARK_THEME : LIGHT_THEME);
      if (cancelled) return;

      setError(result.error);
      if (result.svg) setSvg(result.svg);
      setPending(false);
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setPending(false);
    };
  }, [code, resolved, debounceMs]);

  return { svg, error, pending };
}
