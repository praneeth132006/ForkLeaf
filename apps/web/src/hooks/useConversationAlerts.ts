"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEntry } from "@/lib/live-activity";
import { seenUpTo } from "@/lib/conversation";
import {
  notificationText,
  readNotifyMode,
  shouldNotify,
  writeNotifyMode,
  type NotifyMode,
} from "@/lib/notify";

/**
 * Telling somebody who is not looking that a conversation moved.
 *
 * Two ways, both only while ForkLeaf is not the window in front: a system
 * notification, when the reader asked for them and the browser allows it; and
 * a count in the tab's title, "(2) Editor — ForkLeaf", which needs no
 * permission and clears when the tab is looked at again.
 */

export type NotifyPermission = NotificationPermission | "unsupported";

const permissionNow = (): NotifyPermission =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

export function useConversationAlerts(options: {
  target: { owner: string; repo: string } | null;
  /** The signed-in account, whose own messages never notify. */
  viewer: string | null;
  entries: readonly ActivityEntry[];
  /** Opens a thread, when its notification is clicked. */
  onOpen: (number: number) => void;
}) {
  const { target, viewer, entries, onOpen } = options;
  const owner = target?.owner ?? "";
  const repo = target?.repo ?? "";

  const [mode, setModeState] = useState<{ key: string; value: NotifyMode } | null>(null);
  const key = `${owner}/${repo}`;
  const current: NotifyMode = !target
    ? "off"
    : mode?.key === key
      ? mode.value
      : readNotifyMode(owner, repo);
  const [permission, setPermission] = useState<NotifyPermission>(permissionNow);

  const handled = useRef(0);
  const unseen = useRef(0);
  const baseTitle = useRef<string | null>(null);
  const open = useRef(onOpen);
  useEffect(() => {
    open.current = onOpen;
  }, [onOpen]);

  const setMode = useCallback(
    async (next: NotifyMode): Promise<NotifyPermission> => {
      let allowed = permissionNow();
      if (next !== "off" && allowed === "default") {
        allowed = await Notification.requestPermission();
      }
      setPermission(allowed);
      writeNotifyMode(owner, repo, next);
      setModeState({ key: `${owner}/${repo}`, value: next });
      return allowed;
    },
    [owner, repo],
  );

  useEffect(() => {
    if (!target || !viewer) return;
    const fresh = entries.filter((entry) => entry.v > handled.current);
    if (fresh.length === 0) return;
    handled.current = Math.max(...fresh.map((entry) => entry.v));

    const away = document.visibilityState === "hidden" || !document.hasFocus();
    if (!away) return;

    const worth = fresh.filter((entry) =>
      shouldNotify(entry, {
        mode: current,
        viewer,
        involved: (number) => seenUpTo(owner, repo, number) !== null,
      }),
    );
    if (worth.length === 0) return;

    unseen.current += worth.length;
    baseTitle.current ??= document.title;
    document.title = `(${unseen.current}) ${baseTitle.current}`;

    if (permissionNow() !== "granted") return;
    for (const entry of worth) {
      const { title, body } = notificationText(entry);
      // One per thread: a busy thread replaces its notification rather than
      // stacking ten of them.
      const shown = new Notification(title, { body, tag: `forkleaf-${owner}/${repo}#${entry.n}` });
      shown.onclick = () => {
        window.focus();
        open.current(entry.n);
        shown.close();
      };
    }
  }, [entries, target, viewer, current, owner, repo]);

  // Looking at the tab again clears the count.
  useEffect(() => {
    const clear = () => {
      if (document.visibilityState !== "visible" || baseTitle.current === null) return;
      document.title = baseTitle.current;
      baseTitle.current = null;
      unseen.current = 0;
    };
    document.addEventListener("visibilitychange", clear);
    window.addEventListener("focus", clear);
    return () => {
      document.removeEventListener("visibilitychange", clear);
      window.removeEventListener("focus", clear);
    };
  }, []);

  return { mode: current, setMode, permission };
}
