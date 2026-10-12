"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  buildExam,
  examFolders,
  examNote,
  examTitle,
  gradeAnswer,
  questionBank,
  summarise,
  type ExamGrade,
  type ExamNote,
  type ExamQuestion,
  type ExamVerdict,
} from "@/lib/exam";

/**
 * The exam simulator: set up, sit the paper against the clock, see the marks.
 *
 * The paper is built from the chosen folder's flashcards, definitions and
 * sections. Answers are typed; ⌘↵ moves on. When the time runs out, whatever
 * is unanswered counts as skipped and the marks are shown. The results can be
 * saved as a note under `exams/`, with every miss linked to the place in the
 * notes to reread.
 */

export interface ExamDialogProps {
  onClose: () => void;
  loadNotes: () => Promise<ExamNote[]>;
  /** Writes the results note; resolves to where it went, or null if it could not. */
  onSave: (title: string, content: string) => Promise<string | null>;
  onOpen: (path: string, line: number) => void;
  /** For tests; the clock otherwise. */
  now?: () => number;
  /** For tests; random otherwise. */
  seed?: number;
}

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "setup" }
  | { kind: "sitting"; questions: ExamQuestion[]; index: number; startedAt: number }
  | {
      kind: "done";
      questions: ExamQuestion[];
      grades: ExamGrade[];
      startedAt: number;
      endedAt: number;
    };

const COUNTS = [5, 10, 20, 30];
const MINUTES: Array<number | null> = [null, 5, 10, 20, 30];

const VERDICT: Record<ExamVerdict, { label: string; tone: string }> = {
  right: { label: "Right", tone: "text-[var(--fl-accent)]" },
  partly: { label: "Partly", tone: "text-[var(--fl-warn)]" },
  wrong: { label: "Wrong", tone: "text-[var(--fl-danger)]" },
  skipped: { label: "Skipped", tone: "text-[var(--fl-muted)]" },
};

const KIND: Record<ExamQuestion["kind"], string> = {
  card: "Card",
  define: "Definition",
  explain: "Explain",
};

function stamp(time: number): string {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function ExamDialog({ onClose, loadNotes, onSave, onOpen, now, seed }: ExamDialogProps) {
  const time = useCallback(() => (now ? now() : Date.now()), [now]);
  const [notes, setNotes] = useState<ExamNote[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [folder, setFolder] = useState<string>("");
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState<number | null>(10);
  const [answers, setAnswers] = useState<string[]>([]);
  const [paperSeed, setPaperSeed] = useState(() => seed ?? Math.floor(Math.random() * 2 ** 31));
  const [saved, setSaved] = useState<{ path: string } | { error: string } | null>(null);
  // Bumped every second so the clock redraws.
  const [, setTick] = useState(0);
  const loadRef = useRef(loadNotes);
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    let live = true;
    loadRef.current().then(
      (loaded) => {
        if (!live) return;
        setNotes(loaded);
        setPhase({ kind: "setup" });
      },
      (error: unknown) => {
        if (live) {
          setPhase({
            kind: "error",
            message: error instanceof Error ? error.message : "Your notebook could not be read.",
          });
        }
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const folders = useMemo(() => examFolders(notes.map((note) => note.path)), [notes]);
  const available = useMemo(() => questionBank(notes, folder || null).length, [notes, folder]);

  const finish = useCallback(
    (questions: ExamQuestion[], given: string[], startedAt: number) => {
      setPhase({
        kind: "done",
        questions,
        grades: questions.map((question, index) => gradeAnswer(question, given[index] ?? "")),
        startedAt,
        endedAt: time(),
      });
    },
    [time],
  );

  const start = (sameSeed: number) => {
    const questions = buildExam(notes, { folder: folder || null, count, seed: sameSeed });
    setAnswers(questions.map(() => ""));
    setSaved(null);
    setPhase({ kind: "sitting", questions, index: 0, startedAt: time() });
  };

  // The clock: redraw every second, and hand the paper in when time is up.
  const sitting = phase.kind === "sitting" ? phase : null;
  useEffect(() => {
    if (!sitting || minutes === null) return;
    const deadline = sitting.startedAt + minutes * 60_000;
    const timer = setInterval(() => {
      if (time() >= deadline) {
        clearInterval(timer);
        finish(sitting.questions, answersRef.current, sitting.startedAt);
      } else {
        setTick((value) => value + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [sitting, minutes, finish, time]);
  const remaining =
    sitting && minutes !== null ? sitting.startedAt + minutes * 60_000 - time() : null;

  const move = (to: number) => {
    if (!sitting) return;
    if (to >= sitting.questions.length) {
      finish(sitting.questions, answers, sitting.startedAt);
      return;
    }
    setPhase({ ...sitting, index: Math.max(0, to) });
  };

  const save = async () => {
    if (phase.kind !== "done") return;
    const record = {
      questions: phase.questions,
      answers,
      grades: phase.grades,
      folder: folder || null,
      takenAt: stamp(phase.startedAt),
      minutesUsed: Math.max(1, Math.round((phase.endedAt - phase.startedAt) / 60_000)),
      minutesAllowed: minutes,
    };
    try {
      const path = await onSave(examTitle(record), examNote(record));
      setSaved(path ? { path } : { error: "The results could not be saved." });
    } catch (error) {
      setSaved({
        error: error instanceof Error ? error.message : "The results could not be saved.",
      });
    }
  };

  return (
    <Dialog title="Exam" subtitle="A timed mock exam from your own notes" onClose={onClose} wide>
      {phase.kind === "loading" && (
        <p role="status" className="text-[13px] text-[var(--fl-muted)]">
          Reading your notes…
        </p>
      )}

      {phase.kind === "error" && (
        <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
          {phase.message}
        </p>
      )}

      {phase.kind === "setup" && (
        <div className="grid gap-4 text-[13px]">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1">
              <span className="text-[12px] font-medium text-[var(--fl-muted)]">On</span>
              <select
                id="exam-folder"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                className="fl-input"
              >
                <option value="">The whole notebook</option>
                {folders.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] font-medium text-[var(--fl-muted)]">Questions</span>
              <select
                id="exam-count"
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="fl-input"
              >
                {COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] font-medium text-[var(--fl-muted)]">Time</span>
              <select
                id="exam-minutes"
                value={minutes ?? "none"}
                onChange={(event) =>
                  setMinutes(event.target.value === "none" ? null : Number(event.target.value))
                }
                className="fl-input"
              >
                {MINUTES.map((value) => (
                  <option key={value ?? "none"} value={value ?? "none"}>
                    {value === null ? "No limit" : `${value} minutes`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {available === 0 ? (
            <p className="leading-relaxed text-[var(--fl-muted)]">
              Nothing here to be examined on yet. Exams are made from flashcards (
              <code>Question :: Answer</code>), definitions (<code>**Term** means …</code>) and
              sections with a few sentences under their heading.
            </p>
          ) : (
            <p className="text-[var(--fl-muted)]">
              {available} question{available === 1 ? "" : "s"} to draw from
              {available < count ? `, so this paper will have ${available}` : ""}.
            </p>
          )}

          <div>
            <button
              type="button"
              disabled={available === 0}
              onClick={() => start(paperSeed)}
              className="fl-btn fl-btn-primary"
            >
              Start the exam
            </button>
          </div>
        </div>
      )}

      {sitting && (
        <Sitting
          question={sitting.questions[sitting.index]!}
          index={sitting.index}
          total={sitting.questions.length}
          remaining={remaining}
          answer={answers[sitting.index] ?? ""}
          onAnswer={(value) =>
            setAnswers((current) => current.map((old, i) => (i === sitting.index ? value : old)))
          }
          onBack={() => move(sitting.index - 1)}
          onNext={() => move(sitting.index + 1)}
          onFinish={() => finish(sitting.questions, answers, sitting.startedAt)}
        />
      )}

      {phase.kind === "done" && (
        <Results
          questions={phase.questions}
          grades={phase.grades}
          answers={answers}
          minutes={Math.max(1, Math.round((phase.endedAt - phase.startedAt) / 60_000))}
          saved={saved}
          onSave={() => void save()}
          onOpen={onOpen}
          onRetake={() => start(paperSeed)}
          onNew={() => {
            const next = Math.floor(Math.random() * 2 ** 31);
            setPaperSeed(next);
            setPhase({ kind: "setup" });
          }}
        />
      )}
    </Dialog>
  );
}

function Sitting({
  question,
  index,
  total,
  remaining,
  answer,
  onAnswer,
  onBack,
  onNext,
  onFinish,
}: {
  question: ExamQuestion;
  index: number;
  total: number;
  remaining: number | null;
  answer: string;
  onAnswer: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const last = index === total - 1;
  return (
    <div className="grid gap-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-3 text-[var(--fl-muted)]">
        <span data-testid="exam-progress">
          Question {index + 1} of {total}
        </span>
        <span className="rounded-md bg-[var(--fl-elevated)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
          {KIND[question.kind]}
        </span>
        {remaining !== null && (
          <span
            role="timer"
            aria-label="Time left"
            className={`ml-auto font-mono text-[14px] tabular-nums ${remaining < 60_000 ? "text-[var(--fl-danger)]" : "text-[var(--fl-text)]"}`}
          >
            {clock(remaining)}
          </span>
        )}
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-[var(--fl-elevated)]" aria-hidden="true">
        <div
          className="h-full bg-[var(--fl-accent)] transition-[width]"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>

      <p
        className="font-serif text-[1.375rem] leading-snug text-[var(--fl-text)]"
        id="exam-question"
      >
        {question.prompt}
      </p>

      <textarea
        id="exam-answer"
        key={question.id}
        aria-labelledby="exam-question"
        value={answer}
        onChange={(event) => onAnswer(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onNext();
          }
        }}
        rows={question.kind === "explain" ? 7 : 3}
        autoFocus
        placeholder={question.kind === "explain" ? "Explain it in your own words…" : "Your answer…"}
        className="fl-input w-full resize-y leading-relaxed"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={index === 0}
          className="fl-btn fl-btn-ghost"
        >
          Back
        </button>
        <button type="button" onClick={onNext} className="fl-btn fl-btn-primary">
          {last ? "Finish" : answer.trim() ? "Next" : "Skip"}
        </button>
        <span className="text-[12px] text-[var(--fl-muted)]">
          ⌘↵ for {last ? "finish" : "next"}
        </span>
        {!last && (
          <button
            type="button"
            onClick={onFinish}
            className="ml-auto rounded-lg px-2 py-1 text-[12px] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
          >
            Hand in now
          </button>
        )}
      </div>
    </div>
  );
}

function Results({
  questions,
  grades,
  answers,
  minutes,
  saved,
  onSave,
  onOpen,
  onRetake,
  onNew,
}: {
  questions: ExamQuestion[];
  grades: ExamGrade[];
  answers: string[];
  minutes: number;
  saved: { path: string } | { error: string } | null;
  onSave: () => void;
  onOpen: (path: string, line: number) => void;
  onRetake: () => void;
  onNew: () => void;
}) {
  const summary = summarise(grades);
  return (
    <div className="grid gap-4 text-[13px]">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span
          className="font-serif text-[2.5rem] leading-none text-[var(--fl-text)]"
          data-testid="exam-score"
        >
          {summary.percent}%
        </span>
        <span className="text-[var(--fl-muted)]">
          {summary.right} right · {summary.partly} partly · {summary.wrong} wrong ·{" "}
          {summary.skipped} skipped · {minutes} min
        </span>
      </div>

      <ol className="grid gap-2">
        {questions.map((question, index) => {
          const grade = grades[index]!;
          return (
            <li
              key={question.id}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3"
            >
              <div className="flex flex-wrap items-start gap-2">
                <span
                  className={`shrink-0 text-[12px] font-semibold ${VERDICT[grade.verdict].tone}`}
                >
                  {VERDICT[grade.verdict].label}
                </span>
                <span className="min-w-0 flex-1 text-[var(--fl-text)]">{question.prompt}</span>
                <button
                  type="button"
                  onClick={() => onOpen(question.path, question.line)}
                  className="shrink-0 text-[12px] text-[var(--fl-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
                >
                  {question.title}
                </button>
              </div>
              {grade.verdict !== "right" && (
                <div className="mt-1.5 grid gap-1 text-[12.5px]">
                  {answers[index]?.trim() && (
                    <p className="text-[var(--fl-muted)]">You wrote: {answers[index]}</p>
                  )}
                  <p className="line-clamp-3 text-[var(--fl-text)]">
                    The notes say: {question.expected.replace(/\s+/g, " ")}
                  </p>
                  {grade.missing.length > 0 && (
                    <p className="text-[var(--fl-muted)]">Missed: {grade.missing.join(", ")}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saved !== null && "path" in saved}
          className="fl-btn fl-btn-primary"
        >
          Save results as a note
        </button>
        <button type="button" onClick={onRetake} className="fl-btn fl-btn-ghost">
          Retake this paper
        </button>
        <button type="button" onClick={onNew} className="fl-btn fl-btn-ghost">
          New exam
        </button>
      </div>
      {saved && "path" in saved && (
        <p role="status" className="text-[12.5px] text-[var(--fl-muted)]">
          Saved to {saved.path}, with every miss linked to the notes to reread.
        </p>
      )}
      {saved && "error" in saved && (
        <p role="alert" className="text-[12.5px] text-[var(--fl-danger)]">
          {saved.error}
        </p>
      )}
    </div>
  );
}
