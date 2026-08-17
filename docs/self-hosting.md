# Self-hosting mdnotion

mdnotion is a single Next.js application with no database. Anywhere that runs
Node.js 20.9+ will do.

## Environment variables

| Variable                     | Required        | Purpose                                                                   |
| ---------------------------- | --------------- | ------------------------------------------------------------------------- |
| `SESSION_SECRET`             | For GitHub sync | Encrypts the access token into the session cookie. Minimum 32 characters. |
| `GITHUB_OAUTH_CLIENT_ID`     | For GitHub sync | From your OAuth app.                                                      |
| `GITHUB_OAUTH_CLIENT_SECRET` | For GitHub sync | From your OAuth app. Keep secret.                                         |
| `NEXT_PUBLIC_APP_URL`        | Recommended     | Public origin, e.g. `https://notes.example.com`. Required behind a proxy. |

With none of these set the app still runs, in local-only mode. That is a
legitimate way to deploy it if you just want a good markdown editor.

Generate the session secret with:

```bash
openssl rand -base64 32
```

> Rotating `SESSION_SECRET` invalidates every existing session — users simply
> sign in again. No data is lost, because no data lives in the session.

## Deploying

### Vercel

```bash
npm i -g vercel
vercel link
vercel env add SESSION_SECRET production
vercel env add GITHUB_OAUTH_CLIENT_ID production
vercel env add GITHUB_OAUTH_CLIENT_SECRET production
vercel env add NEXT_PUBLIC_APP_URL production
vercel deploy --prod
```

Set the OAuth app's callback URL to
`https://your-domain.example.com/api/auth/callback`.

### Node

```bash
pnpm install
pnpm build
pnpm --filter @mdnotion/web start
```

Serves on port 3000 by default; override with `PORT`.

### Docker

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY --from=build /app .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@mdnotion/web", "start"]
```

Pass the environment variables at run time — never bake secrets into the image.

## OAuth App vs GitHub App

The default flow uses an **OAuth App** with the `repo` scope. That scope covers
private repositories, which mdnotion needs in order to write notes to a private
notes repo — but it does grant access to _all_ the user's repositories.

If you want per-repository access instead, register a **GitHub App**:

1. **Settings → Developer settings → GitHub Apps → New GitHub App**
2. Permissions: **Repository permissions → Contents: Read & write**
3. Callback URL: `https://your-domain/api/auth/callback`
4. Enable **Request user authorization (OAuth) during installation**

The user-to-server token a GitHub App issues works with the same endpoints
mdnotion already uses, so `apps/web/src/app/api/auth/` needs only small changes:
the authorize URL becomes the app's install URL, and tokens expire after 8 hours
unless you enable and handle refresh tokens.

This is a genuinely better security posture and a welcome contribution — see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Reverse proxies

Set `NEXT_PUBLIC_APP_URL` to the public origin. Without it the OAuth callback is
built from the request URL, which behind a proxy is often the internal address —
and GitHub will reject the redirect because it doesn't match the registered one.

## Backups

There is nothing to back up. Notes live in the user's GitHub repository; the
browser cache is a cache. Losing the server loses nothing but uptime.

## Rate limits

Authenticated GitHub requests are limited to 5,000/hour per user. mdnotion stays
well inside that:

- Tree listings use conditional requests, so unchanged trees cost no quota.
- Edits are debounced and coalesced, so a long writing session is a handful of
  requests rather than one per keystroke.

If a limit is hit anyway, the client backs off using GitHub's own reset headers
and the change queue retries — nothing is lost.
