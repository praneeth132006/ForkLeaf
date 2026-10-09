# Analytics

ForkLeaf sends explicit usage events to PostHog and, independently, Firebase.
It does not record sessions or capture note text, filenames, repository names,
or editor clicks. URLs keep only the route and campaign parameters; document
and note titles are stripped from PostHog events.

## Configuration

Copy the PostHog section of `.env.example` into `apps/web/.env.local`:

- `NEXT_PUBLIC_POSTHOG_KEY`: the project's public project token, not a personal API key.
- `NEXT_PUBLIC_POSTHOG_HOST`: `https://us.i.posthog.com` for US Cloud,
  `https://eu.i.posthog.com` for EU Cloud, or your ingestion host.

`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is accepted as a fallback to the key variable.
Firebase configuration is not required for PostHog events.

Set the same variables in the hosting provider's intended environment before
building. Next.js embeds them in the browser bundle: changing a variable requires
a new build and deployment. Turbo includes PostHog variables and local environment
files in the build cache key.

## Events

| Event in PostHog         | Meaning                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `$pageview`              | Initial visit or navigation to a different public route/campaign             |
| `$pageleave`             | SDK event when leaving the document                                          |
| `note_created`           | A tracked note-creation action in the editor                                 |
| `repo_connected`         | Repository connected through the editor picker                               |
| `github_sign_in_started` | Sign-in initiated from the editor                                            |
| `note_exported`          | Export generated and download triggered; format, scope, count                |
| `note_print_opened`      | PDF print flow opened; actual save/cancellation is controlled by the browser |
| `sync_completed`         | A GitHub sync batch completed                                                |

Firebase continues receiving `page_view`; the PostHog adapter translates it to
`$pageview`. The previous integration sent `page_view` to both providers, which
left PostHog Web Analytics empty even while custom events arrived. Historical
`page_view` events remain available in Product Analytics; this fix does not
rewrite them. Web Analytics fills with new visits after deployment.

Switching notes within `/editor` does not count as another web pageview. GitHub
login identifies signed-in users; sign-out resets the analytics identity.

## Verify a deployment

1. Open the correct PostHog project, then Activity / live events.
2. Visit the deployed home page and navigate to Docs. Allow ingestion time.
3. Confirm `$pageview` events with the deployment's `$host` and the expected
   `$pathname`. Confirm `$pageleave` after leaving the tab.
4. Create a note and export it as Markdown. Confirm `note_created` and
   `note_exported`; no note names or contents should be present.
5. Open Web Analytics for today and filter to the production hostname to exclude
   local or preview testing. Use Product Analytics for feature events and funnels.

If no events arrive, check the project's token and region, deployment build-time
variables, browser network failures, content blockers, and the active PostHog
project/date/hostname filters. Existing browser opt-out settings are respected.

References: [Next.js installation](https://posthog.com/docs/web-analytics/installation/nextjs)
and [pageleave diagnostics](https://posthog.com/docs/health-checks/pageleave-events).
