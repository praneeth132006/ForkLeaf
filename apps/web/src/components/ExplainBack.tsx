"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareRecall, type RecallReport } from "@/lib/explain-back";

/**
 * Explain it back, in the note's own place.
 *
 * The note is hidden while you write what you remember of it; then the two sit
 * side by side, with every sentence of the note marked by how much of it you
 * got back, and what you left out named. It takes the spot the note was in —
 * no window over it — and hands the note back when you are done.
 */

export interface ExplainBackProps {
  title: string;
  /** The note's markdown, without its properties. */
  content: string;
  onClose: () => void;
}

const MIN_WORDS = 3;

const TONE: Record<RecallReport["sentences"][number]["status"], string> = {
  remembered: "border-l-[#30a46c] bg-[#30a46c]/10",
  partly: "border-l-[#f5a524] bg-[#f5a524]/10",
  missed: "border-l-[#e5484d] bg-[#e5484d]/10",
};

const LABEL: Record<RecallReport["sentences"][number]["status"], string> = {
  remembered: "Remembered",
  partly: "Partly",
  missed: "Missed",
};

export function ExplainBack({ title, content, onClose }: ExplainBackProps) {
  const [attempt, setAttempt] = useState("");
  const [stage, setStage] = useState<"write" | "compare">("write");
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (stage === "write") area.current?.focus();
  }, [stage]);

  const words = attempt.trim() ? attempt.trim().split(/\s+/).length : 0;
  const report = useMemo(
    () => (stage === "compare" ? compareRecall(content, attempt) : null),
    [stage, content, attempt],
  );

  const button =
    "rounded-lg border border-[var(--fl-border)] px-3 py-1.5 text-[13px] font-medium text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-50";
  const primary =
    "rounded-lg bg-[var(--fl-accent)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)] disabled:opacity-50";

  return (
    <section
      aria-label="Explain it back"
      className="mx-auto flex min-h-0 w-full max-w-[64rem] flex-1 flex-col gap-4 overflow-y-auto px-6 py-8"
    >
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fl-muted)]">
            Explain it back
          </p>
          <h2 className="truncate text-[22px] font-semibold text-[var(--fl-text)]">{title}</h2>
        </div>
        <button type="button" onClick={onClose} className={button}>
          Back to the note
        </button>
      </header>

      {stage === "write" ? (
        <>
          <p className="max-w-prose text-[14px] leading-relaxed text-[var(--fl-muted)]">
            The note is hidden. Write down everything you remember about it, in your own words — as
            if explaining it to someone. Then compare, and see exactly what you forgot.
          </p>
          <textarea
            ref={area}
            value={attempt}
            onChange={(event) => setAttempt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && words >= MIN_WORDS) {
                event.preventDefault();
                setStage("compare");
              }
            }}
            aria-label="What you remember"
            placeholder="Start with the main idea, then the details…"
            className="min-h-[320px] flex-1 resize-y rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4 text-[15px] leading-relaxed text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
          />
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--fl-muted)]">
              {words} {words === 1 ? "word" : "words"}
            </span>
            <button
              type="button"
              disabled={words < MIN_WORDS}
              onClick={() => setStage("compare")}
              className={`${primary} ml-auto`}
            >
              Compare with the note <span className="opacity-60">(⌘↵)</span>
            </button>
          </div>
        </>
      ) : (
        report && (
          <>
            <div
              role="status"
              className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] px-4 py-3"
            >
              <p className="text-[15px] font-semibold text-[var(--fl-text)]">
                You remembered {report.score}% of the key ideas
              </p>
              <p className="text-[12.5px] text-[var(--fl-muted)]">
                {report.remembered} remembered · {report.partly} partly · {report.missed} missed
              </p>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setStage("write")} className={button}>
                  Edit my answer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttempt("");
                    setStage("write");
                  }}
                  className={button}
                >
                  Try again
                </button>
              </div>
            </div>

            {report.sentences.length === 0 ? (
              <p className="text-[14px] text-[var(--fl-muted)]">
                This note has no sentences to compare against yet.
              </p>
            ) : (
              <div className="grid min-h-0 gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--fl-muted)]">
                    What you wrote
                  </h3>
                  <div className="grid gap-1.5">
                    {report.attempt.map((sentence, index) => (
                      <p
                        key={index}
                        className={`rounded-md px-3 py-2 text-[14px] leading-relaxed text-[var(--fl-text)] ${
                          sentence.inNote ? "" : "border border-dashed border-[var(--fl-border)]"
                        }`}
                      >
                        {sentence.text}
                        {!sentence.inNote && (
                          <span className="mt-1 block text-[11.5px] text-[var(--fl-muted)]">
                            Not in the note — check it is right
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--fl-muted)]">
                    The note
                  </h3>
                  <ol className="grid gap-1.5">
                    {report.sentences.map((sentence, index) => (
                      <li
                        key={index}
                        data-status={sentence.status}
                        className={`rounded-md border-l-4 px-3 py-2 text-[14px] leading-relaxed text-[var(--fl-text)] ${TONE[sentence.status]}`}
                      >
                        <span className="sr-only">{LABEL[sentence.status]}: </span>
                        {sentence.text}
                        {sentence.status !== "remembered" && sentence.missing.length > 0 && (
                          <span className="mt-1 block text-[12px] text-[var(--fl-muted)]">
                            You left out: {sentence.missing.join(", ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
