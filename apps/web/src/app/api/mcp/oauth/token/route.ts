import { type NextRequest } from "next/server";
import { GrantError, issueTokens, openCode, refreshTokens } from "@/lib/mcp-grants";
import { noStoreJson, oauthError, preflight } from "@/lib/mcp-http";
import { verifyPkce } from "@/lib/mcp-oauth";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * The token endpoint: a code, or a refresh token, becomes tokens.
 *
 * A code is good for five minutes and only with the PKCE verifier its request
 * was made with. It is also remembered as spent on this instance, which is as
 * much single use as a server with no storage can promise.
 */

const spent = new Map<string, number>();

function spend(code: string): boolean {
  const now = Date.now();
  for (const [key, until] of spent) if (until < now) spent.delete(key);
  if (spent.has(code)) return false;
  spent.set(code, now + 5 * 60_000);
  return true;
}

async function readForm(request: NextRequest): Promise<URLSearchParams> {
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body ?? {})) {
      if (typeof value === "string") form.set(key, value);
    }
    return form;
  }
  return new URLSearchParams(await request.text());
}

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, { name: "mcp-token", limit: 60, windowMs: 60_000 });
  } catch {
    return oauthError("slow_down", "Too many token requests. Wait a minute.", 429);
  }

  const form = await readForm(request);

  try {
    switch (form.get("grant_type")) {
      case "authorization_code": {
        const value = form.get("code");
        const code = await openCode(value);
        if (!code || !value) {
          return oauthError(
            "invalid_grant",
            "That code has expired or is not valid. Connect again.",
          );
        }
        const clientId = form.get("client_id");
        if (clientId && clientId !== code.clientId) {
          return oauthError("invalid_grant", "That code was issued to another client.");
        }
        const redirectUri = form.get("redirect_uri");
        if (redirectUri && redirectUri !== code.redirectUri) {
          return oauthError(
            "invalid_grant",
            "redirect_uri does not match the authorisation request.",
          );
        }
        if (!(await verifyPkce(form.get("code_verifier"), code.codeChallenge))) {
          return oauthError("invalid_grant", "The PKCE code_verifier does not match.");
        }
        if (!spend(value)) return oauthError("invalid_grant", "That code has already been used.");
        return noStoreJson(await issueTokens(code.clientId, code.grant, code.target));
      }
      case "refresh_token": {
        const refreshToken = form.get("refresh_token");
        if (!refreshToken) return oauthError("invalid_request", "refresh_token is missing.");
        return noStoreJson(await refreshTokens(refreshToken, form.get("client_id")));
      }
      default:
        return oauthError(
          "unsupported_grant_type",
          "Only authorization_code and refresh_token are supported.",
        );
    }
  } catch (error) {
    if (error instanceof GrantError) {
      return oauthError(error.code, error.message, error.code === "invalid_grant" ? 400 : 503);
    }
    console.error("[forkleaf] MCP token request failed:", error);
    return oauthError("server_error", "Something went wrong issuing the token.", 500);
  }
}

export const OPTIONS = preflight;
