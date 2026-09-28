"use client";

import { heatmap, streak, thisWeek, type StudyLog } from "@/lib/study-log";

/**
 * The run of days studied, and a grid of the last few months.
 *
 * The number that matters is the streak — the thing a missed day would break
 * — so it is the large one. The grid is for the longer view: a patchy month
 * shows up as a patchy month, which no single count can say.
 */

const LEVEL_OPACITY = ["", "0.3", "0.5", "0.75", "1"] as const;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function StudyStreak({
  log,
  today,
  className = "",
}: {
  log: StudyLog;
  today: string;
  className?: string;
}) {
  const run = streak(log, today);
  const week = thisWeek(log, today);
  const grid = heatmap(log, today);
  const studiedToday = (log.get(today) ?? 0) > 0;

  return (
    <div className={`${className} flex flex-wrap items-center gap-4`}>
      <div className="min-w-[8rem]">
        <p className="text-[22px] font-semibold leading-none text-[var(--fl-text)]">
          {run > 0 ? plural(run, "day") : "No streak"}
        </p>
        <p className="mt-1 text-[12px] text-[var(--fl-muted)]">
          {run > 0
            ? studiedToday
              ? "in a row, today included"
              : "in a row — study today to keep it"
            : "Study today to start one"}
          <br />
          {plural(week, "card")} this week
        </p>
      </div>

      <div
        role="img"
        aria-label={`Cards studied each day for the last ${grid.length} weeks`}
        className="flex gap-[3px] overflow-x-auto"
      >
        {grid.map((weekDays) => (
          <div key={weekDays[0]!.day} className="flex flex-col gap-[3px]">
            {weekDays.map((cell) => (
              <span
                key={cell.day}
                title={
                  cell.future
                    ? undefined
                    : `${cell.day}: ${cell.count ? plural(cell.count, "card") : "nothing studied"}`
                }
                className={`block h-[10px] w-[10px] rounded-[2px] ${
                  cell.future
                    ? "bg-transparent"
                    : cell.level === 0
                      ? "bg-[var(--fl-elevated)]"
                      : "bg-[var(--fl-accent)]"
                } ${cell.day === today ? "ring-1 ring-[var(--fl-text)]/40" : ""}`}
                style={cell.level > 0 ? { opacity: LEVEL_OPACITY[cell.level] } : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
