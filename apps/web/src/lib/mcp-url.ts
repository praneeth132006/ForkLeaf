/**
 * The address an AI assistant connects to.
 *
 * Claude's connectors, and most hosted clients, reach the server from the
 * internet rather than from this computer, so `localhost` is an address they
 * cannot open. When the page is running locally and a public deployment is
 * configured, that is the address worth handing out — the notes are in the
 * same GitHub repository either way.
 */
export function mcpServerUrl(
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
  publicUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
): { url: string; local: boolean } {
  const local = isLocalOrigin(origin);
  const base = local && publicUrl ? publicUrl.replace(/\/+$/, "") : origin;
  return { url: `${base}/api/mcp`, local: local && !publicUrl };
}

function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return (
      host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local")
    );
  } catch {
    return false;
  }
}
