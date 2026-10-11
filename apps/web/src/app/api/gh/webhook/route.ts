import { NextResponse, type NextRequest } from "next/server";
import { sharedStore } from "@/lib/shared-store";
import {
  LOG_MAX,
  LOG_TTL_MS,
  activityFromWebhook,
  activityKey,
  verifySignature,
} from "@/lib/live-activity";

/**
 * Where GitHub tells ForkLeaf's GitHub App about discussions and comments.
 *
 * Signed with the App's webhook secret, checked before anything else is read.
 * Each delivery is recorded once — GitHub redelivers on a timeout — as a short
 * entry in the repository's activity log, which the live streams read.
 *
 * Without GITHUB_WEBHOOK_SECRET this answers 503 and records nothing: an
 * endpoint that would write whatever anybody posted to it is worse than none.
 */

/** GitHub caps webhook payloads at 25 MB; a discussion event is a few KB. */
const MAX_BODY = 1_000_000;

const reply = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return reply(503, { error: "Webhooks are not configured on this server." });

  const body = await request.text();
  if (body.length > MAX_BODY) return reply(413, { error: "Too large." });

  if (!(await verifySignature(secret, body, request.headers.get("x-hub-signature-256")))) {
    return reply(401, { error: "Bad signature." });
  }

  const event = request.headers.get("x-github-event") ?? "";
  if (event === "ping") return reply(200, { ok: true });

  const delivery = request.headers.get("x-github-delivery");
  const store = sharedStore();
  if (delivery && !(await store.once(`gh-delivery:${delivery}`, LOG_TTL_MS))) {
    return reply(200, { duplicate: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return reply(400, { error: "Not JSON." });
  }

  const activity = activityFromWebhook(event, payload as Parameters<typeof activityFromWebhook>[1]);
  if (!activity) return reply(200, { ignored: true });

  const version = await store.append(
    activityKey(activity.owner, activity.repo),
    { ...activity.entry },
    LOG_MAX,
    LOG_TTL_MS,
  );
  return reply(200, { ok: true, version });
}
