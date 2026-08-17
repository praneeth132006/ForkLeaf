# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability.

Report it privately through
[GitHub Security Advisories](https://github.com/praneeth132006/MarkDown/security/advisories/new),
which lets us discuss and fix the issue before it becomes public.

Please include:

- What the vulnerability allows an attacker to do
- Steps to reproduce it
- The version or commit you tested against

You can expect an initial response within a few days.

## Supported versions

This project is pre-1.0. Fixes land on `main`; there are no maintained release
branches yet.

## Security model

Understanding these boundaries will help you judge whether something is a real
vulnerability.

### The GitHub access token

The token is the most sensitive thing this application touches — it can read and
write every repository the user granted access to.

- It is **never sent to the browser**. It is encrypted (JWE, `A256GCM`) into an
  `httpOnly`, `SameSite=Lax` cookie that only the server can decrypt.
- All GitHub calls are proxied through `/api/gh/*` route handlers.
- `SESSION_SECRET` is the key. It must be at least 32 characters and is required
  — the app refuses to start a session rather than falling back to a default.
- The OAuth flow uses a single-use `state` parameter, compared in constant time,
  to prevent login CSRF.

**A finding that recovers the token from the browser, or forges a valid session
cookie, is a critical vulnerability.**

### Untrusted note content

Note content is untrusted input. A user can open any public repository, and the
notes inside it are written by other people.

- Markdown is rendered through `rehype-sanitize` with an explicit allowlist;
  raw HTML in notes is escaped, not rendered.
- Mermaid runs with `securityLevel: "strict"` (no click handlers, no HTML
  labels) and the resulting SVG is additionally sanitised with DOMPurify.
- Links are restricted to `http`, `https` and `mailto`; `javascript:` URLs are
  stripped in both the editor and the renderer.

**Any input that results in script execution in the preview, the editor, or an
exported HTML file is a vulnerability.** Tests covering these paths live in
`packages/markdown-engine/src/index.test.ts`.

### Path handling

All repository paths are normalised server-side before reaching the GitHub API:
`..` segments are dropped, leading slashes removed, and owner/repo names are
pattern-checked. Writes are capped at 5 MB per file and 100 changes per commit.

### Commit history

Commit squashing force-updates a git ref. It is deliberately constrained: it
only ever rewrites a commit that mdnotion itself authored, only within a short
time window, never a root commit, and it re-reads the branch head immediately
before pushing — falling back to a normal commit if anything moved.

**A way to make mdnotion rewrite or destroy a commit it did not create is a
vulnerability.**

## Out of scope

- Anything requiring the attacker to already control the user's GitHub account
- Vulnerabilities in GitHub itself
- Self-hosted deployments that set a weak or shared `SESSION_SECRET`
- Denial of service against your own self-hosted instance
