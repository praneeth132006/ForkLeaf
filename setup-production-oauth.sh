#!/usr/bin/env bash
# Configures GitHub OAuth on the ForkLeaf production deployment.
#
# Run from the repository root:  ./setup-production-oauth.sh
#
# You are asked for the OAuth app's Client ID and Client Secret. Both come from
# github.com/settings/applications/3798270. The secret is shown only once when
# it is generated, so click "Generate a new client secret" if you no longer have
# it. Nothing is written to disk by this script.
set -euo pipefail

APP_URL="https://forkleaf.vercel.app"

command -v vercel >/dev/null || { echo "vercel CLI not found. Install it: npm i -g vercel"; exit 1; }

echo "Vercel account signed in here: $(vercel whoami 2>/dev/null || echo none)"
echo
echo "ForkLeaf is deployed under the 'praneethdev' account. If the name above is"
echo "not that account, switch now, or the env vars land on the wrong project."
read -rp "Switch accounts? [y/N] " switch
if [[ "$switch" =~ ^[Yy]$ ]]; then
  vercel logout || true
  vercel login
fi

# Links this checkout to the Vercel project. Choose the EXISTING ForkLeaf
# project when prompted; creating a new one gives you a second deployment at a
# different URL and fixes nothing.
[ -f .vercel/project.json ] || vercel link

read -rp  "GitHub OAuth Client ID: " CLIENT_ID
read -rsp "GitHub OAuth Client Secret: " CLIENT_SECRET; echo
[ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ] || { echo "Both values are required."; exit 1; }

SESSION_SECRET="$(openssl rand -base64 32)"

# Remove before adding: `vercel env add` fails on a name that already exists,
# and a half-configured project is the state this script exists to get out of.
for name in GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET SESSION_SECRET NEXT_PUBLIC_APP_URL; do
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
done

printf '%s' "$CLIENT_ID"      | vercel env add GITHUB_OAUTH_CLIENT_ID production
printf '%s' "$CLIENT_SECRET"  | vercel env add GITHUB_OAUTH_CLIENT_SECRET production
printf '%s' "$SESSION_SECRET" | vercel env add SESSION_SECRET production
printf '%s' "$APP_URL"        | vercel env add NEXT_PUBLIC_APP_URL production

# NEXT_PUBLIC_ values are inlined at build time, and the deployment now serving
# traffic was built without any of these. It needs a fresh build to pick them up.
vercel --prod

echo
echo "Verifying..."
sleep 5
curl -s -o /dev/null -w 'auth/github -> %{http_code} %{redirect_url}\n' "$APP_URL/api/auth/github"
echo
echo "Want:    307 to github.com/login/oauth/authorize"
echo "Not:     307 to /?error=oauth_not_configured"
