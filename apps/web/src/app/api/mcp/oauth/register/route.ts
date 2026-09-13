import { type NextRequest } from "next/server";
import { sealClient } from "@/lib/mcp-grants";
import { noStoreJson, oauthError, preflight } from "@/lib/mcp-http";
import { parseRegistration } from "@/lib/mcp-oauth";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * RFC 7591 dynamic client registration.
 *
 * The client id handed back is the registration itself, sealed, so there is no
 * table of clients to keep: the consent page opens the id to learn the name to
 * show and the addresses it may send the answer to.
 */
export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, { name: "mcp-register", limit: 20, windowMs: 10 * 60_000 });
  } catch {
    return oauthError(
      "invalid_request",
      "Too many registrations. Try again in a few minutes.",
      429,
    );
  }

  const parsed = parseRegistration(await request.json().catch(() => null));
  if (!parsed.ok) return oauthError("invalid_client_metadata", parsed.error);

  let clientId: string;
  try {
    clientId = await sealClient(parsed.value);
  } catch {
    return oauthError("server_error", "This ForkLeaf is not set up for signing in.", 503);
  }

  return noStoreJson(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: parsed.value.clientName,
      redirect_uris: parsed.value.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}

export const OPTIONS = preflight;
