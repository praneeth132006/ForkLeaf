"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Workspace } from "@forkleaf/types";
import { suggestBranchName } from "@/lib/branch-name";
import {
  ApiGatewayError,
  createBranch,
  forkRepo,
  listBranches,
  openPullRequest,
  type BranchSummaryDto,
  type PullRequestDto,
} from "@/lib/gateway";
import { Dialog } from "./Dialog";

export interface ProposeChangesDialogProps {
  workspace: Workspace;
  login: string;
  /** Seeds the title — usually the note the user is looking at. */
  subject: string;
  onClose: () => void;
  /**
   * Moves the workspace onto the branch the changes were written to, so
   * continued editing keeps landing on the same pull request.
   */
  onSwitchBranch: (branch: string, repo?: { owner: string; repo: string }) => void | Promise<void>;
}

type Stage = "form" | "working" | "done";

/**
 * Propose changes as a pull request, without leaving the editor.
 *
 * The case this exists for: someone reading another project's documentation
 * spots a mistake. Fixing it used to mean leaving, forking, cloning, branching,
 * editing, pushing and opening a pull request — seven steps, most of them git.
 * Here it is a title, a description and a button, and ForkLeaf does the forking
 * and branching underneath.
 *
 * Writing to a repository you own follows the same path minus the fork, because
 * "put this on a branch and open a PR" is a reasonable thing to want in your own
 * repository too.
 */
export function ProposeChangesDialog({
  workspace,
  login,
  subject,
  onClose,
  onSwitchBranch,
}: ProposeChangesDialogProps) {
  const [branches, setBranches] = useState<BranchSummaryDto[] | null>(null);
  const [base, setBase] = useState(workspace.repo.branch);
  const [branch, setBranch] = useState(() => suggestBranchName(login, subject));
  const [title, setTitle] = useState(() => `docs: ${subject}`);
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState(false);

  const [stage, setStage] = useState<Stage>("form");
  const [step, setStep] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pull, setPull] = useState<PullRequestDto | null>(null);

  useEffect(() => {
    let cancelled = false;

    void listBranches(workspace.repo.owner, workspace.repo.repo)
      .then((result) => {
        if (cancelled) return;
        setBranches(result);
        const fallback = result.find((item) => item.isDefault)?.name;
        if (fallback) setBase(fallback);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [workspace.repo.owner, workspace.repo.repo]);

  const baseBranch = useMemo(
    () => branches?.find((item) => item.name === base) ?? null,
    [branches, base],
  );

  const submit = async () => {
    if (!branch.trim() || !title.trim()) return;

    setStage("working");
    setError(null);

    try {
      // Writing happens on whatever repository the user can actually push to:
      // theirs if they have access, a fork of it if they do not.
      setStep("Checking your access to the repository…");
      let target = { owner: workspace.repo.owner, repo: workspace.repo.repo };
      let forked = false;

      try {
        await createBranch({ ...target, name: branch, from: base });
      } catch (err) {
        if (!(err instanceof ApiGatewayError) || err.code !== "forbidden") throw err;

        setStep("You cannot push here — forking the repository…");
        const fork = await forkRepo(workspace.repo.owner, workspace.repo.repo);
        target = { owner: fork.repo.owner, repo: fork.repo.name };
        forked = true;

        setStep("Creating your branch on the fork…");
        await createBranch({ ...target, name: branch, from: base });
      }

      setStep("Opening the pull request…");
      const result = await openPullRequest({
        owner: workspace.repo.owner,
        repo: workspace.repo.repo,
        base,
        head: branch,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(draft ? { draft: true } : {}),
      });

      setPull(result.pull);
      setStage("done");

      // Keep editing against the branch the PR was opened from, so the next
      // save updates the pull request rather than going somewhere unrelated.
      await onSwitchBranch(branch, forked ? target : undefined);
    } catch (err) {
      setError(err);
      setStage("form");
    }
  };

  return (
    <Dialog
      title="Propose these changes"
      subtitle={`${workspace.repo.owner}/${workspace.repo.repo}`}
      onClose={onClose}
    >
      {stage === "done" && pull ? (
        <div>
          <p className="text-[14px] leading-relaxed text-[var(--fl-text)]">
            Pull request <span className="font-mono">#{pull.number}</span> is open
            {pull.draft ? " as a draft" : ""}.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--fl-muted)]">
            You are now editing on <span className="font-mono">{branch}</span>. Further saves land
            on that branch and show up in the pull request automatically.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={pull.url}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg bg-[var(--fl-accent)] px-3.5 py-2 text-[13px] font-semibold text-[var(--fl-accent-contrast)] hover:opacity-90"
            >
              View on GitHub
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--fl-border)] px-3.5 py-2 text-[13px] text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
            >
              Keep writing
            </button>
          </div>
        </div>
      ) : (
        <>
          {error != null && <ErrorNotice error={error} />}

          <Field label="Pull request title">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={stage === "working"}
              className={inputClass}
            />
          </Field>

          <Field label="Description" hint="Optional. Markdown works here, as on GitHub.">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={stage === "working"}
              rows={4}
              placeholder="What changed, and why it matters."
              className={`${inputClass} resize-y`}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Merge into">
              <select
                value={base}
                onChange={(event) => setBase(event.target.value)}
                disabled={stage === "working" || !branches}
                className={inputClass}
              >
                {(branches ?? [{ name: base, isDefault: true, protected: false, sha: "" }]).map(
                  (item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                      {item.isDefault ? " (default)" : ""}
                    </option>
                  ),
                )}
              </select>
            </Field>

            <Field label="From branch" hint="Created for you if it does not exist.">
              <input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                disabled={stage === "working"}
                className={`${inputClass} font-mono text-[12.5px]`}
              />
            </Field>
          </div>

          {baseBranch?.protected && (
            <p className="mb-3 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
              <span className="font-mono">{base}</span> is protected, which is exactly what a pull
              request is for — your changes go to a branch and wait for review.
            </p>
          )}

          <label className="mb-4 flex cursor-pointer items-start gap-2 text-[13.5px]">
            <input
              type="checkbox"
              checked={draft}
              onChange={(event) => setDraft(event.target.checked)}
              disabled={stage === "working"}
              className="mt-0.5 accent-[var(--fl-accent)]"
            />
            <span>
              <span className="block text-[var(--fl-text)]">Open as a draft</span>
              <span className="block text-[12.5px] text-[var(--fl-muted)]">
                Signals it is not ready for review yet.
              </span>
            </span>
          </label>

          {stage === "working" && (
            <p aria-live="polite" className="mb-3 text-[13px] text-[var(--fl-muted)]">
              {step}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={stage === "working" || !branch.trim() || !title.trim()}
            className="w-full rounded-lg bg-[var(--fl-accent)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)] disabled:opacity-40"
          >
            {stage === "working" ? "Working…" : "Open pull request"}
          </button>

          <p className="mt-4 border-t border-[var(--fl-border)] pt-3 text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
            If you cannot push to this repository, ForkLeaf forks it to your account first and opens
            the pull request from there. Nothing is pushed to anyone else&rsquo;s repository.
          </p>
        </>
      )}
    </Dialog>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[13.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)] disabled:opacity-50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-[var(--fl-muted)]">{hint}</span>}
    </label>
  );
}

function ErrorNotice({ error }: { error: unknown }) {
  const expired = error instanceof ApiGatewayError && error.needsAuth;

  return (
    <div
      role="alert"
      className="mb-3 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3 text-[13px]"
    >
      <p className="text-[var(--fl-danger)]">
        {error instanceof Error ? error.message : String(error)}
      </p>
      {expired && (
        <a
          href="/api/auth/github"
          className="mt-2 inline-block text-[var(--fl-accent)] underline underline-offset-2"
        >
          Sign in with GitHub again
        </a>
      )}
    </div>
  );
}
