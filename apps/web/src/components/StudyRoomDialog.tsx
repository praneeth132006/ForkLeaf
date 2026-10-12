"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { freshness, leaderboard, type RoomMember, type StudyProgress } from "@/lib/study-room";
import type { StudyRoomDto } from "@/lib/gateway";

/**
 * A shared deck's study room: everybody studying it, ranked by this week.
 *
 * Reading the room needs nothing but a sign-in. Joining it — "Share my
 * progress" — writes one line in the deck repository's Discussions, which
 * ForkLeaf rewrites whenever it is shared again, and opens the room first if
 * nobody has.
 */

export interface StudyRoomDialogProps {
  onClose: () => void;
  /** `owner/name` of the deck's repository. */
  repo: string;
  signedIn: boolean;
  /** This member's progress right now, worked out from their notebook. */
  progress: () => Promise<StudyProgress>;
  load: () => Promise<StudyRoomDto>;
  share: (progress: StudyProgress) => Promise<void>;
  /** For tests; the clock otherwise. */
  today?: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; room: StudyRoomDto; members: RoomMember[] }
  | { kind: "error"; message: string };

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function StudyRoomDialog({
  onClose,
  repo,
  signedIn,
  progress,
  load,
  share,
  today,
}: StudyRoomDialogProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [mine, setMine] = useState<StudyProgress | null>(null);
  const [sharing, setSharing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const day = today ?? new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    load().then(
      (room) => {
        if (live) setState({ kind: "ready", room, members: leaderboard(room.comments) });
      },
      (error: unknown) => {
        if (live)
          setState({ kind: "error", message: message(error, "The study room could not be read.") });
      },
    );
    progress().then(
      (value) => {
        if (live) setMine(value);
      },
      () => {},
    );
    return () => {
      live = false;
    };
    // Read on open and after sharing; the callbacks are inline props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, reloads]);

  const join = async () => {
    if (!mine) return;
    setSharing(true);
    setProblem(null);
    try {
      await share(mine);
      setReloads((count) => count + 1);
    } catch (error) {
      setProblem(message(error, "Your progress could not be shared."));
    } finally {
      setSharing(false);
    }
  };

  const viewerIn = state.kind === "ready" && state.members.some((member) => member.isViewer);

  return (
    <Dialog title="Study room" subtitle={`Everybody studying ${repo}`} onClose={onClose} wide>
      <div className="grid gap-4 text-[13px]">
        {!signedIn && (
          <p className="text-[var(--fl-muted)]">
            Sign in with GitHub to see who else is studying this deck.
          </p>
        )}

        {signedIn && state.kind === "loading" && (
          <p role="status" className="text-[var(--fl-muted)]">
            Opening the room…
          </p>
        )}

        {state.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {state.message}
          </p>
        )}

        {state.kind === "ready" && (
          <>
            {state.members.length === 0 ? (
              <p className="leading-relaxed text-[var(--fl-muted)]">
                {state.room.room
                  ? "Nobody has shared their progress yet."
                  : "There is no study room for this deck yet."}{" "}
                Share yours and you are the first on the board — anyone who copies the deck can
                join.
              </p>
            ) : (
              <ol className="grid gap-1" data-testid="study-board">
                {state.members.map((member, index) => (
                  <li
                    key={member.login}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-2 ${
                      member.isViewer ? "bg-[var(--fl-accent-soft)]" : "bg-[var(--fl-elevated)]"
                    }`}
                  >
                    <span className="w-6 font-mono text-[12px] text-[var(--fl-muted)]">
                      {index + 1}
                    </span>
                    {member.avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- GitHub's avatar
                      <img src={member.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                    )}
                    <span className="font-semibold text-[var(--fl-text)]">
                      @{member.login}
                      {member.isViewer ? " (you)" : ""}
                    </span>
                    <span className="text-[var(--fl-text)]">
                      {member.week} this week · {member.streak}-day streak
                    </span>
                    <span className="text-[var(--fl-muted)]">
                      {member.mastered} of {member.cards} mastered
                    </span>
                    <span className="ml-auto text-[11.5px] text-[var(--fl-muted)]">
                      {freshness(member.on, day)}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {mine && (
              <div className="grid gap-2 rounded-xl border border-[var(--fl-border)] p-3">
                <p className="text-[var(--fl-text)]">
                  You: {mine.week} reviewed this week · {mine.streak}-day streak · {mine.mastered}{" "}
                  of {mine.cards} cards in this deck mastered
                </p>
                <p className="text-[12px] text-[var(--fl-muted)]">
                  Sharing writes this one line — nothing else from your notebook — in the
                  deck&rsquo;s GitHub Discussions, where everyone in the room can see it. Sharing
                  again updates the same line.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void join()}
                    disabled={sharing || !state.room.enabled}
                    className="fl-btn fl-btn-primary"
                  >
                    {sharing ? "Sharing…" : viewerIn ? "Update my progress" : "Share my progress"}
                  </button>
                  {state.room.room && (
                    <a
                      href={state.room.room.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12.5px] text-[var(--fl-muted)] underline underline-offset-2 hover:text-[var(--fl-text)]"
                    >
                      Open the room on GitHub
                    </a>
                  )}
                </div>
                {!state.room.enabled && (
                  <p className="text-[12.5px] text-[var(--fl-warn)]">
                    Discussions is switched off in {repo}. Its owner can turn it on in the
                    repository&rsquo;s Settings → General → Features.
                  </p>
                )}
              </div>
            )}
            {problem && (
              <p role="alert" className="text-[var(--fl-danger)]">
                {problem}
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
