"use client";

import { useCallback, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { readDismissals, writeDismissals } from "@/lib/freshness-dismissals";
import {
  isDismissed,
  surveyNotebook,
  withDismissal,
  type Dismissals,
  type StaleNote,
  type Survey,
  type SurveySource,
} from "@/lib/notebook-freshness";

/**
 * What has gone off, across the whole notebook.
 *
 * The freshness panel beside a note answers the question for the note you
 * happen to have open, which is the wrong way round: nobody opens a note to
 * find out that it rotted. They find out when they act on it, in front of
 * somebody. This is the version that comes to you — four notes point at a
 * file that is not there any more, two make claims about a version that has
 * moved on — and it is short, because a list of everything is a list nobody
 * reads.
 *
 * Nothing here changes a note. Every row opens the note it is about and gets
 * out of the way, because what to do about a stale note is a judgement the
 * app is in no position to make: the version number may be deliberate, the
 * missing picture may be one you meant to delete.
 */

export interface FreshnessDialogProps {
  onClose: () => void;
  /** Every note in the notebook, read when the sweep starts. */
  loadNotes: () => Promise<SurveySource[]>;
  /**
   * Every path that exists, so a reference to a missing one can be spotted.
   *
   * The repository's whole file list, not just its notes — a picture is a file
   * a note can point at, and one that has been deleted is the clearest signal
   * on this list.
   */
  loadFiles: () => Promise<string[]>;
  onOpenNote: (path: string) => void;
  /**
   * Which notebook this is, for remembering what has been dismissed.
   *
   * The dismissals are read here rather than passed in, because this dialog
   * only exists once somebody has opened it — which is to say on the client,
   * after a click — and that is the one place `localStorage` can be read
   * during a render without the server disagreeing about what it said.
   */
  workspaceId: string;
}

type State =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "done"; survey: Survey }
  | { kind: "error"; message: string };

export function FreshnessDialog({
  onClose,
  loadNotes,
  loadFiles,
  onOpenNote,
  workspaceId,
}: FreshnessDialogProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dismissals, setDismissals] = useState<Dismissals>(() => readDismissals(workspaceId));

  const dismiss = useCallback(
    (note: StaleNote) => {
      setDismissals((current) => {
        const next = withDismissal(current, note);
        writeDismissals(workspaceId, next);
        return next;
      });
    },
    [workspaceId],
  );
  /** True once the reader asks to see the notes they have already dealt with. */
  const [showDismissed, setShowDismissed] = useState(false);

  const run = useCallback(async () => {
    setState({ kind: "reading" });

    try {
      const [notes, files] = await Promise.all([loadNotes(), loadFiles()]);
      setState({ kind: "done", survey: surveyNotebook(notes, { files: new Set(files) }) });
    } catch (problem: unknown) {
      setState({
        kind: "error",
        message:
          problem instanceof Error
            ? problem.message
            : "Your notebook could not be read. Nothing was changed.",
      });
    }
  }, [loadNotes, loadFiles]);

  const survey = state.kind === "done" ? state.survey : null;
  const shown = (survey?.notes ?? []).filter(
    (note) => showDismissed || !isDismissed(dismissals, note),
  );
  const hidden = (survey?.notes ?? []).length - shown.length;

  return (
    <Dialog
      title="What has gone stale"
      subtitle="Notes pointing at files that have gone, and claims that have aged"
      onClose={onClose}
      wide
    >
      {state.kind === "idle" && (
        <div className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
          <p className="max-w-2xl">
            Reads every note on this device and looks for three things: a link to a file that is not
            in the repository, a <code>[[link]]</code> matching no note, and datable claims —
            version numbers, CVEs, &ldquo;currently&rdquo; — in a note nobody has touched for a long
            time.
          </p>
          <p className="mt-2 max-w-2xl">
            The first two are facts. The third is an inference, and is reported as one. Nothing is
            changed either way.
          </p>
          <button type="button" onClick={() => void run()} className="fl-btn fl-btn-primary mt-4">
            Check my notes
          </button>
        </div>
      )}

      {state.kind === "reading" && (
        <p role="status" className="text-[13px] text-[var(--fl-muted)]">
          Reading your notes…
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
          {state.message}
        </p>
      )}

      {survey && (
        <div className="text-[13px] leading-relaxed">
          <p className="text-[var(--fl-text)]">
            {summary(survey, shown.length)}{" "}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowDismissed((current) => !current)}
                className="text-[var(--fl-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
              >
                {showDismissed ? "Hide the ones you have dealt with" : `${hidden} dismissed`}
              </button>
            )}
          </p>

          <ul className="mt-3 space-y-2">
            {shown.map((note) => (
              <li
                key={note.path}
                className={`rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-2.5 ${
                  isDismissed(dismissals, note) ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onOpenNote(note.path)}
                      className="block max-w-full truncate text-left text-[13px] font-medium text-[var(--fl-text)] underline decoration-dotted underline-offset-2"
                    >
                      {note.title}
                    </button>
                    <span className="block truncate font-mono text-[10.5px] text-[var(--fl-muted)]">
                      {note.path}
                      {note.ageMonths != null && note.ageMonths > 0
                        ? ` · untouched for ${note.ageMonths} month${note.ageMonths === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </span>

                  {!isDismissed(dismissals, note) && (
                    <button
                      type="button"
                      onClick={() => dismiss(note)}
                      title="Hide this until the note is edited again"
                      aria-label={`Dismiss ${note.title}`}
                      className="shrink-0 rounded border border-[var(--fl-border)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-surface)] hover:text-[var(--fl-text)]"
                    >
                      It is fine
                    </button>
                  )}
                </div>

                <ul className="mt-1.5 space-y-0.5 text-[12px] text-[var(--fl-muted)]">
                  {note.missingFiles.map((file) => (
                    <li key={file}>
                      <span className="text-[var(--fl-danger)]">Links to</span>{" "}
                      <span className="font-mono text-[11px]">{file}</span>, which is not in the
                      repository.
                    </li>
                  ))}
                  {note.missingLinks.map((target) => (
                    <li key={target}>
                      <span className="text-[var(--fl-danger)]">[[{target}]]</span> matches no note.
                    </li>
                  ))}
                  {/* The inference, and only when it is why the note is on
                      the list at all. A note listed for a broken link has no
                      business also being told its prose has no shelf life. */}
                  {note.missingFiles.length === 0 &&
                    note.missingLinks.length === 0 &&
                    note.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => void run()}
            className="fl-btn fl-btn-ghost mt-4 !py-1.5"
          >
            Check again
          </button>
        </div>
      )}
    </Dialog>
  );
}

/** The headline: what was read, and what is worth looking at. */
function summary(survey: Survey, showing: number): string {
  if (survey.notes.length === 0) {
    return `${survey.scanned} ${survey.scanned === 1 ? "note" : "notes"} read. Nothing looks stale.`;
  }

  if (showing === 0) {
    return `${survey.scanned} notes read. You have dealt with everything on the list.`;
  }

  const parts: string[] = [];
  if (survey.counts.missingFiles > 0) {
    parts.push(
      `${survey.counts.missingFiles} ${survey.counts.missingFiles === 1 ? "note points" : "notes point"} at a file that has gone`,
    );
  }
  if (survey.counts.missingLinks > 0) {
    parts.push(
      `${survey.counts.missingLinks} ${survey.counts.missingLinks === 1 ? "has" : "have"} a link matching no note`,
    );
  }
  if (survey.counts.likelyStale > 0) {
    parts.push(`${survey.counts.likelyStale} may have aged out`);
  }

  return `${survey.scanned} notes read. ${parts.join("; ")}.`;
}
