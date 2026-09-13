import "server-only";
import { refreshUserToken, TokenRefused, type TokenGrant } from "@/lib/github-oauth";
import { openValue, sealValue } from "@/lib/session";

/**
 * What an assistant is given, sealed.
 *
 * Every value here — a client registration, an authorisation code, an access
 * token, a refresh token — is encrypted and authenticated under the server's
 * secret, with its purpose inside. ForkLeaf stores none of them: the assistant
 * holds its tokens and renews them, which is the only arrangement that works
 * with GitHub refresh tokens that can each be spent once.
 */

export interface NotebookTarget {
  owner: string;
  repo: string;
  /** Null for the repository's default branch. */
  branch: string | null;
  directory: string;
  readOnly: boolean;
  /** The GitHub account that chose the notebook. */
  login: string;
}

export interface GitHubGrant {
  token: string;
  expiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

export interface ClientRecord {
  redirectUris: string[];
  clientName: string;
}

export interface PendingRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  /** The OAuth state of the GitHub round trip this request is waiting on. */
  oauthState: string;
  target: NotebookTarget;
}

export interface CodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  grant: GitHubGrant;
  target: NotebookTarget;
}

export interface AccessRecord {
  token: string;
  expiresAt?: number;
  target: NotebookTarget;
}

interface RefreshRecord {
  clientId: string;
  grant: GitHubGrant;
  target: NotebookTarget;
}

const PURPOSE = {
  client: "mcp-client",
  pending: "mcp-pending",
  code: "mcp-code",
  access: "mcp-access",
  refresh: "mcp-refresh",
} as const;

const HOUR = 3600;
const DAY = 86_400;
const nowSeconds = () => Math.floor(Date.now() / 1000);

export const sealClient = (record: ClientRecord) =>
  sealValue({ ...record }, PURPOSE.client, 3650 * DAY);
export const openClient = (value: string | null | undefined) =>
  openValue<ClientRecord>(value, PURPOSE.client);

export const sealPending = (record: PendingRecord) =>
  sealValue({ ...record }, PURPOSE.pending, 600);
export const openPending = (value: string | null | undefined) =>
  openValue<PendingRecord>(value, PURPOSE.pending);

/** Five minutes: a code is exchanged the moment the assistant receives it. */
export const sealCode = (record: CodeRecord) => sealValue({ ...record }, PURPOSE.code, 300);
export const openCode = (value: string | null | undefined) =>
  openValue<CodeRecord>(value, PURPOSE.code);

export const openAccess = (value: string | null | undefined) =>
  openValue<AccessRecord>(value, PURPOSE.access);

export function grantFrom(grant: TokenGrant): GitHubGrant {
  return {
    token: grant.token,
    ...(grant.expiresAt !== undefined ? { expiresAt: grant.expiresAt } : {}),
    ...(grant.refreshToken !== undefined ? { refreshToken: grant.refreshToken } : {}),
    ...(grant.refreshExpiresAt !== undefined ? { refreshExpiresAt: grant.refreshExpiresAt } : {}),
  };
}

export class GrantError extends Error {
  constructor(
    readonly code: "invalid_grant" | "temporarily_unavailable",
    message: string,
  ) {
    super(message);
  }
}

/**
 * The pair an assistant keeps.
 *
 * The access token never outlives the GitHub token inside it, so a request
 * that gets past the seal has a token GitHub will accept. The refresh token
 * lasts as long as GitHub's own, or six months for a token that never expires.
 */
export async function issueTokens(clientId: string, grant: GitHubGrant, target: NotebookTarget) {
  const accessTtl = grant.expiresAt
    ? Math.max(60, Math.min(8 * HOUR, grant.expiresAt - nowSeconds() - 60))
    : 8 * HOUR;
  const refreshTtl = grant.refreshExpiresAt
    ? Math.max(60, grant.refreshExpiresAt - nowSeconds())
    : 180 * DAY;

  const access = await sealValue(
    {
      token: grant.token,
      ...(grant.expiresAt !== undefined ? { expiresAt: grant.expiresAt } : {}),
      target,
    },
    PURPOSE.access,
    accessTtl,
  );
  const refresh = await sealValue({ clientId, grant, target }, PURPOSE.refresh, refreshTtl);

  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: accessTtl,
    refresh_token: refresh,
    scope: "notebook",
  };
}

/** Renews an assistant's access, with GitHub when its token expires. */
export async function refreshTokens(refreshToken: string, clientId: string | null) {
  const record = await openValue<RefreshRecord>(refreshToken, PURPOSE.refresh);
  if (!record) {
    throw new GrantError(
      "invalid_grant",
      "That refresh token has expired or is not valid. Connect again.",
    );
  }
  if (clientId && clientId !== record.clientId) {
    throw new GrantError("invalid_grant", "That refresh token was issued to another client.");
  }

  // An OAuth App's token does not expire; there is nothing to renew.
  if (!record.grant.refreshToken) return issueTokens(record.clientId, record.grant, record.target);

  try {
    const renewed = await refreshUserToken(record.grant.refreshToken);
    return issueTokens(record.clientId, grantFrom(renewed), record.target);
  } catch (error) {
    if (error instanceof TokenRefused) {
      throw new GrantError(
        "invalid_grant",
        "GitHub would not renew access. Connect ForkLeaf again.",
      );
    }
    throw new GrantError(
      "temporarily_unavailable",
      "GitHub could not be reached. Try again shortly.",
    );
  }
}
