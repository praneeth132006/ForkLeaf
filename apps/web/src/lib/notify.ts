import type { ActivityEntry } from "@/lib/live-activity";

/**
 * When a conversation is worth interrupting somebody for.
 *
 * Off unless asked for, per repository and per device: a notes app that
 * starts pinging the moment it is opened has decided for its reader what
 * matters. "Threads I'm in" means threads this device has opened or written
 * in, and messages that name you; "Everything" means every new message.
 * Your own messages, edits, deletions and answers never notify.
 */

export type NotifyMode = "off" | "mine" | "all";

const keyFor = (owner: string, repo: string) => `forkleaf:notify:${owner}/${repo}`.toLowerCase();

export function readNotifyMode(owner: string, repo: string): NotifyMode {
  try {
    const value = window.localStorage.getItem(keyFor(owner, repo));
    return value === "mine" || value === "all" ? value : "off";
  } catch {
    return "off";
  }
}

export function writeNotifyMode(owner: string, repo: string, mode: NotifyMode): void {
  try {
    window.localStorage.setItem(keyFor(owner, repo), mode);
  } catch {
    // Not remembered: the choice lasts as long as the page.
  }
}

/** Whether `text` names `login` as an @mention, as GitHub would link it. */
export function mentions(text: string | null, login: string): boolean {
  if (!text || !login) return false;
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w/])@${escaped}(?![\\w-])`, "i").test(text);
}

export function shouldNotify(
  entry: ActivityEntry,
  options: { mode: NotifyMode; viewer: string; involved: (number: number) => boolean },
): boolean {
  if (options.mode === "off") return false;
  if (!["comment", "reply", "discussion"].includes(entry.kind)) return false;
  if (entry.by && entry.by.toLowerCase() === options.viewer.toLowerCase()) return false;
  if (options.mode === "all") return true;
  return options.involved(entry.n) || mentions(entry.excerpt, options.viewer);
}

export function notificationText(entry: ActivityEntry): { title: string; body: string } {
  const who = entry.by ? `@${entry.by}` : "Somebody";
  const verb =
    entry.kind === "discussion" ? "started" : entry.kind === "reply" ? "replied in" : "wrote in";
  return { title: `${who} ${verb} “${entry.title}”`, body: entry.excerpt ?? "" };
}
