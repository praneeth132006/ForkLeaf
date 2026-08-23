# Security audit — ForkLeaf

**Date:** 2026-08-23 · **Target:** `forkleaf.vercel.app` + ForkLeaf v0.2.0 source
**Method:** static source review ("in") + non-destructive live probing ("out")
**Toolkit:** [RedBlueSkills](https://github.com/praneeth132006/RedBlueSkills) `attack-my-application` orchestrator

The full styled report is [`audit-2026-08-23.html`](audit-2026-08-23.html). This file is the
GitHub-readable summary.

## Verdict: A− — no critical or high-severity findings

ForkLeaf is well-secured. The GitHub token is the one asset that matters and the
architecture is built around never letting it reach the browser. Ten load-bearing
controls were tested and held (see below).

## Findings

| ID   | Finding                                                                                 | Severity | Fix                                                 |
| ---- | --------------------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| M-01 | OAuth requests repo-wide `repo` scope — full read/write to every repo, not just notes   | Medium   | Offer a fine-grained GitHub App path                |
| M-02 | Stateless 30-day session can't be revoked; logout only clears the client cookie         | Medium   | Add per-session `jti` + shorter/ sliding TTL        |
| L-01 | Read API routes (`tree`, `file`, `history`, `repos`, `branches`, `raw`) are unthrottled | Low      | Apply existing `enforceRateLimit`                   |
| L-02 | Rate limiter is in-memory / per-instance on serverless                                  | Low      | Durable limiter (Upstash) behind the same interface |
| L-03 | `img-src https:` allows any-host image tracking beacons in untrusted notes              | Low      | Optional "block remote images" mode                 |
| I-01 | Firebase profile identity is client-asserted (no impact — own-row, display-only)        | Info     | —                                                   |
| I-02 | Local `.env.local` with a short-lived OIDC token (git-ignored, not committed)           | Info     | Hygiene only                                        |
| I-03 | `/api/session` returns 200 when signed out (by design; no token disclosed)              | Info     | —                                                   |

## Tested & clean

Token exposure · stored XSS in preview (`rehype-sanitize`, no raw HTML) · Mermaid XSS
(`securityLevel:strict` + DOMPurify) · SSRF & path traversal (transport choke-point rejects
`..`/off-host) · CSRF (live 403 on foreign `Origin`) · login CSRF (single-use state,
constant-time compare) · publish path traversal (slug allowlist) · IDOR (delegated to GitHub) ·
Firestore rules (default-deny, owner-only) · security headers (full suite confirmed live).

## Prioritized remediation

1. Rate-limit the read routes (**L-01**) — highest impact per effort; the helper already exists.
2. Make sessions revocable (**M-02**).
3. Offer a fine-grained GitHub App path (**M-01**).
4. Durable rate limiter (**L-02**).
5. Decide remote-image policy (**L-03**).

> Assessment performed with the RedBlueSkills toolkit. Every offensive check is paired with its
> detection/hardening counterpart, per the toolkit's discipline.
