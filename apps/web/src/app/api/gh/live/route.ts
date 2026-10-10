import { type NextRequest } from "next/server";
import { ApiError, assertName, handle, requireClient } from "@/lib/api-helpers";
import { sharedStore } from "@/lib/shared-store";
import { LOG_MAX, activityKey, activityStream } from "@/lib/live-activity";

/**
 * A repository's conversations, as they happen: server-sent events.
 *
 * Open to anybody who can read the repository — checked once, against
 * GitHub, when the stream opens — and to nobody else, since the entries name
 * discussions and quote the start of messages. After that it reads only the
 * shared activity log, never GitHub, so a stream costs no API quota however
 * long it stays open.
 *
 * 204 when this server has no webhook secret: the one answer that tells a
 * browser's EventSource to stop reconnecting, so it falls back to polling.
 */

/** A stream lasts four minutes; the browser reconnects where it left off. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  let owner: string;
  let repo: string;
  try {
    const params = new URL(request.url).searchParams;
    owner = assertName(params.get("owner") ?? "", "owner");
    repo = assertName(params.get("repo") ?? "", "repository");

    if (!process.env.GITHUB_WEBHOOK_SECRET) return new Response(null, { status: 204 });

    const { client } = await requireClient();
    const found = await client.getRepo(owner, repo);
    if (!found) throw new ApiError(404, "not-found", "That repository is not one you can read.");
  } catch (error) {
    return handle(() => Promise.reject(error));
  }

  const params = new URL(request.url).searchParams;
  const resumeFrom = request.headers.get("last-event-id") ?? params.get("since");
  const since = resumeFrom !== null && /^\d{1,12}$/.test(resumeFrom) ? Number(resumeFrom) : null;

  const store = sharedStore();
  const key = activityKey(owner, repo);
  const stream = activityStream({
    readLog: () => store.log(key, LOG_MAX),
    readVersion: () => store.logVersion(key),
    since,
    signal: request.signal,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Proxies that buffer would hold every event until the stream ends.
      "X-Accel-Buffering": "no",
    },
  });
}
