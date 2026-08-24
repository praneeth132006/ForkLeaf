/**
 * Recognising YouTube links, so a note can show the video rather than a URL.
 *
 * The note itself never stops being portable markdown: a video is written as
 * an ordinary link on a line of its own, which is what GitHub, an IDE or any
 * other markdown tool shows — a link. Only the surfaces that can afford an
 * iframe, the editor and the preview, upgrade it to a player. Nothing is
 * written to the file that another tool would fail to understand.
 */

/** A video, and where in it to start. */
export interface YoutubeVideo {
  /** The eleven-character video id. */
  id: string;
  /** Seconds into the video to start at, when the link asked for one. */
  start?: number;
}

/** Every host YouTube hands out links for. */
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

/** Paths that carry the id as their last segment rather than as `?v=`. */
const ID_IN_PATH = /^\/(embed|shorts|live|v|e)\/([A-Za-z0-9_-]{11})/;

const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * `1h2m30s`, `90s` or plain `90` → seconds.
 *
 * YouTube writes the first form in a "share from here" link and the last in
 * an `?start=`, and both end up in notes.
 */
function secondsFrom(value: string | null): number | undefined {
  if (!value) return undefined;

  if (/^\d+$/.test(value)) return Number(value);

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return undefined;

  const [, hours, minutes, seconds] = match;
  return Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

/**
 * The video a URL points at, or null for anything that is not one.
 *
 * Parsed with `URL` rather than matched with one big regular expression: the
 * host has to be compared as a host, or `https://youtube.com.attacker.example`
 * reads as a YouTube link and we would frame a stranger's page.
 */
export function youtubeVideoFrom(url: string): YoutubeVideo | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const start = secondsFrom(parsed.searchParams.get("t") ?? parsed.searchParams.get("start"));

  const inPath = ID_IN_PATH.exec(parsed.pathname);
  if (inPath) return video(inPath[2]!, start);

  if (parsed.hostname.toLowerCase().endsWith("youtu.be")) {
    const id = parsed.pathname.slice(1).split("/")[0] ?? "";
    return ID.test(id) ? video(id, start) : null;
  }

  if (parsed.pathname === "/watch") {
    const id = parsed.searchParams.get("v") ?? "";
    return ID.test(id) ? video(id, start) : null;
  }

  return null;
}

function video(id: string, start: number | undefined): YoutubeVideo {
  return start && start > 0 ? { id, start } : { id };
}

/** True for a URL that names a YouTube video. */
export function isYoutubeUrl(url: string): boolean {
  return youtubeVideoFrom(url) !== null;
}

/** Where the player is loaded from. */
export const YOUTUBE_EMBED_ORIGIN = "https://www.youtube-nocookie.com";

/**
 * The player URL for a video.
 *
 * `youtube-nocookie.com` because embedding the ordinary domain drops tracking
 * cookies on every reader of a note that happens to contain a video, which is
 * not a thing a notes app should do on their behalf.
 */
export function youtubeEmbedUrl(video: YoutubeVideo): string {
  const params = new URLSearchParams({ rel: "0" });
  if (video.start) params.set("start", String(video.start));
  return `${YOUTUBE_EMBED_ORIGIN}/embed/${video.id}?${params.toString()}`;
}

/** The canonical watch URL, which is what gets written into the markdown. */
export function youtubeWatchUrl(video: YoutubeVideo): string {
  const base = `https://www.youtube.com/watch?v=${video.id}`;
  return video.start ? `${base}&t=${video.start}s` : base;
}
