"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ECHO_ANSWERS_KEY,
  answerKey,
  echoes,
  parseAnswers,
  withAnswer,
  type EchoAnswer,
  type EchoSource,
} from "@/lib/echoes";

/**
 * A line from each of yesterday, a week, a month and a year ago, and one
 * question about each: is it still true?
 *
 * Answers are kept on this device for a month, so a morning's answers stay
 * answered through the day. "Changed my mind" and "Forgot this" open the note
 * — the first to write down what changed, the second to read it again.
 */

export interface EchoesSectionProps {
  sources: readonly EchoSource[];
  today: string;
  hrefFor: (source: EchoSource) => string;
}

const LABELS: Record<EchoAnswer, string> = {
  true: "Still true",
  changed: "Changed my mind",
  forgot: "Forgot this",
};

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(ECHO_ANSWERS_KEY, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ECHO_ANSWERS_KEY, onChange);
  };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(ECHO_ANSWERS_KEY);
  } catch {
    return null;
  }
}

const none = () => null;

export function EchoesSection({ sources, today, hrefFor }: EchoesSectionProps) {
  const found = useMemo(() => echoes(sources, today), [sources, today]);
  const raw = useSyncExternalStore(subscribe, readRaw, none);
  const answers = useMemo(() => parseAnswers(raw), [raw]);

  if (found.length === 0) return null;

  const answer = (key: string, value: EchoAnswer) => {
    try {
      window.localStorage.setItem(
        ECHO_ANSWERS_KEY,
        JSON.stringify(withAnswer(parseAnswers(readRaw()), key, value, today)),
      );
      window.dispatchEvent(new Event(ECHO_ANSWERS_KEY));
    } catch {
      // Storage blocked: the answer is not kept, and nothing else breaks.
    }
  };

  return (
    <section className="mb-8" aria-label="Echoes">
      <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fl-muted)]">
        Echoes
      </h2>
      <p className="mb-3 text-[12.5px] text-[var(--fl-muted)]">
        Something you wrote on each of these days. Is it still true?
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {found.map((echo) => {
          const key = answerKey(echo, today);
          const given = answers[key];
          return (
            <figure
              key={echo.day}
              data-testid="echo"
              className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4"
            >
              <figcaption className="text-[11.5px] text-[var(--fl-muted)]">
                {echo.label} · {echo.day} ·{" "}
                <Link
                  href={hrefFor(echo.source)}
                  className="underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
                >
                  {echo.source.title}
                </Link>
              </figcaption>
              <blockquote className="mt-2 font-[family-name:var(--font-reading)] text-[15px] leading-relaxed text-[var(--fl-text)]">
                “{echo.sentence}”
              </blockquote>
              {given ? (
                <p className="mt-3 text-[12px] text-[var(--fl-accent)]">{LABELS[given]}</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
                  <button
                    type="button"
                    onClick={() => answer(key, "true")}
                    className="rounded-lg border border-[var(--fl-border)] px-2.5 py-1 text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
                  >
                    Still true
                  </button>
                  <Link
                    href={hrefFor(echo.source)}
                    onClick={() => answer(key, "changed")}
                    className="rounded-lg border border-[var(--fl-border)] px-2.5 py-1 text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
                  >
                    Changed my mind
                  </Link>
                  <Link
                    href={hrefFor(echo.source)}
                    onClick={() => answer(key, "forgot")}
                    className="rounded-lg px-2.5 py-1 text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                  >
                    Forgot this
                  </Link>
                </div>
              )}
            </figure>
          );
        })}
      </div>
    </section>
  );
}
