"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveStatus } from "@/hooks/useLiveActivity";
import type { NotifyPermission } from "@/hooks/useConversationAlerts";
import type { NotifyMode } from "@/lib/notify";

/**
 * The bell: whether conversations are arriving live, and whether to be told
 * about them when not looking.
 *
 * The dot on it is the live connection — filled when messages arrive as they
 * are posted, hollow when ForkLeaf is checking on a timer instead — so "why
 * did that take fifteen seconds?" has an answer one glance away.
 */

const CHOICES: { mode: NotifyMode; label: string; hint: string }[] = [
  { mode: "off", label: "Off", hint: "No notifications" },
  { mode: "mine", label: "Threads I'm in", hint: "Threads you opened or wrote in, and @mentions" },
  { mode: "all", label: "Everything", hint: "Every new message in this notebook" },
];

const LIVE_TEXT: Record<LiveStatus, string> = {
  live: "Live — new messages arrive as they are posted.",
  connecting: "Connecting to live updates…",
  off: "Checking for new messages every 15 seconds.",
};

export function NotifyMenu({
  live,
  mode,
  permission,
  onChange,
}: {
  live: LiveStatus;
  mode: NotifyMode;
  permission: NotifyPermission;
  onChange: (mode: NotifyMode) => Promise<NotifyPermission>;
}) {
  const [open, setOpen] = useState(false);
  const [refused, setRefused] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !box.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications and live updates — ${live === "live" ? "live" : "not live"}`}
        title={LIVE_TEXT[live]}
        className="relative rounded p-1 text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3zM6.5 14h3" />
          {mode === "off" && <path d="M2.5 2.5l11 11" />}
        </svg>
        <span
          aria-hidden="true"
          className={`absolute right-0.5 bottom-0.5 h-1.5 w-1.5 rounded-full border border-[var(--fl-accent)] ${
            live === "live" ? "bg-[var(--fl-accent)]" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3 text-[12.5px] shadow-[var(--fl-shadow-lg)]"
        >
          <p className="text-[11.5px] text-[var(--fl-muted)]" role="status">
            {LIVE_TEXT[live]}
          </p>

          <fieldset className="mt-3">
            <legend className="mb-1.5 font-medium text-[var(--fl-text)]">Notify me about</legend>
            {CHOICES.map((choice) => (
              <label key={choice.mode} className="flex cursor-pointer items-start gap-2 py-1">
                <input
                  type="radio"
                  name="notify"
                  checked={mode === choice.mode}
                  disabled={choice.mode !== "off" && permission === "unsupported"}
                  onChange={async () => {
                    const answer = await onChange(choice.mode);
                    setRefused(choice.mode !== "off" && answer === "denied");
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-[var(--fl-text)]">{choice.label}</span>
                  <span className="block text-[11.5px] text-[var(--fl-muted)]">{choice.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {permission === "unsupported" ? (
            <p className="mt-2 text-[11.5px] text-[var(--fl-muted)]">
              This browser cannot show notifications.
            </p>
          ) : (permission === "denied" || refused) && mode !== "off" ? (
            <p role="alert" className="mt-2 text-[11.5px] text-[var(--fl-warn)]">
              Notifications are blocked for this site in your browser&rsquo;s settings. The
              tab&rsquo;s title still counts new messages.
            </p>
          ) : null}

          {live === "off" && mode !== "off" && (
            <p className="mt-2 text-[11.5px] text-[var(--fl-muted)]">
              Notifications need live updates, which this server has not been set up for.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
