"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
 *
 * The panel below is positioned against the window rather than against the
 * button, because every surface this bell sits on is an `.fl-panel`, and that
 * class clips its children to its rounded corner. An absolutely positioned
 * menu wider than the gap between the bell and the panel's edge was therefore
 * cut off rather than overflowing — which on a phone, where the conversation
 * column is barely wider than the menu itself, sliced the first few characters
 * off every line in it. Measured and clamped to the window is the same trick
 * `ContextMenu` uses, and the only one that cannot be clipped by an ancestor.
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
  const bell = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  // One way out, so the measurement is always cleared with the panel it
  // belongs to: a stale `place` would put the next opening at wherever the
  // bell was the last time, for the frame before it is measured again.
  const close = () => {
    setOpen(false);
    setPlace(null);
  };

  // Measured after the panel exists, so its real width decides where it goes:
  // right-aligned under the bell when there is room, and slid back inside the
  // window when there is not. `left` is clamped rather than flipped because a
  // menu this wide on a narrow screen has no side to flip to — it simply sits
  // against the margin.
  useLayoutEffect(() => {
    if (!open) return;

    const settle = () => {
      const trigger = bell.current?.getBoundingClientRect();
      const panel = box.current?.querySelector("[role=dialog]")?.getBoundingClientRect();
      if (!trigger || !panel) return;

      const MARGIN = 8;
      setPlace({
        top: Math.min(
          trigger.bottom + 4,
          Math.max(MARGIN, window.innerHeight - panel.height - MARGIN),
        ),
        left: Math.max(
          MARGIN,
          Math.min(trigger.right - panel.width, window.innerWidth - panel.width - MARGIN),
        ),
      });
    };

    settle();
    window.addEventListener("resize", settle);
    // Capturing, so the menu follows a scroll of any container it hangs over
    // rather than staying behind where the bell used to be.
    window.addEventListener("scroll", settle, true);
    return () => {
      window.removeEventListener("resize", settle);
      window.removeEventListener("scroll", settle, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !box.current?.contains(event.target as Node)
      ) {
        setOpen(false);
        setPlace(null);
      }
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        ref={bell}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
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
          style={place ?? undefined}
          // Hidden for the frame between mounting and being measured, so the
          // panel is never seen at the top-left corner on its way to the bell.
          className={`fixed z-50 w-[min(16rem,calc(100vw-1rem))] rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3 text-[12.5px] shadow-[var(--fl-shadow-lg)] ${
            place ? "" : "invisible"
          }`}
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
