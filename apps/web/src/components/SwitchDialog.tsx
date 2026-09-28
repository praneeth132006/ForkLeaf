"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  WORKFLOW_PATH,
  addOnGitHubUrl,
  checkSwitch,
  switchWorkflow,
  type SwitchProblem,
} from "@/lib/dead-mans-switch";

/**
 * Setting up "If I stop writing".
 *
 * ForkLeaf does not add the workflow itself: GitHub asks for a separate
 * permission to write Actions, which ForkLeaf does not hold, and a file that
 * can publish a folder on its own should be one its owner has read. So this
 * builds it, shows every line, and opens github.com's new-file page with it
 * filled in — one click to commit it there, in the owner's own name.
 */

export interface SwitchDialogProps {
  repo: { owner: string; repo: string; branch: string };
  /** Folders in the notebook, to choose one to publish. */
  folders: readonly string[];
  onClose: () => void;
}

const PERIODS = [
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
];

const PROBLEMS: Record<SwitchProblem, string> = {
  days: "Choose how long to wait.",
  folder: "That folder name cannot be used.",
  person: "That is not a GitHub username.",
  nothing: "Choose a folder to publish, someone to tell, or both.",
};

export function SwitchDialog({ repo, folders, onClose }: SwitchDialogProps) {
  const [days, setDays] = useState(180);
  const [folder, setFolder] = useState<string>("");
  const [person, setPerson] = useState("");
  const [copied, setCopied] = useState(false);

  const settings = {
    days,
    folder: folder || null,
    person: person.trim().replace(/^@/, "") || null,
  };
  const problem = checkSwitch(settings);
  const workflow = useMemo(
    () => (problem ? null : switchWorkflow(settings)),
    // The settings object is rebuilt each render; its fields are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [problem, days, folder, person],
  );

  const label = "grid gap-1 text-[12px] text-[var(--fl-muted)]";

  return (
    <Dialog
      title="If I stop writing"
      subtitle="A GitHub Action in your own repository that acts when the notebook goes quiet"
      onClose={onClose}
      wide
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-[13px]">
        <p className="leading-relaxed text-[var(--fl-muted)]">
          Once a day GitHub counts the days since anything was written here. Two weeks before the
          limit it opens an issue to remind you — writing anything starts the count again. At the
          limit it does what you choose below, once. It never deletes a note or changes who can see
          the repository, and deleting the file turns it off.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className={label}>
            After
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              aria-label="Days without writing"
              className="fl-input"
            >
              {PERIODS.map((period) => (
                <option key={period.days} value={period.days}>
                  {period.label} without a note
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Publish this folder
            <select
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              aria-label="Folder to publish"
              className="fl-input"
            >
              <option value="">Nothing</option>
              {folders.map((each) => (
                <option key={each} value={each}>
                  {each}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Tell this person (GitHub username)
            <input
              value={person}
              onChange={(event) => setPerson(event.target.value)}
              aria-label="Person to tell"
              placeholder="@someone-you-trust"
              className="fl-input"
            />
          </label>
        </div>

        {folder && (
          <p className="text-[12px] text-[var(--fl-muted)]">
            The folder is copied to <code>docs/{folder}</code>. It is only public if GitHub Pages is
            on for this repository and the repository allows it.
          </p>
        )}

        {problem ? (
          <p role="alert" className="text-[var(--fl-danger)]">
            {PROBLEMS[problem]}
          </p>
        ) : (
          workflow && (
            <>
              <details className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3">
                <summary className="cursor-pointer font-medium text-[var(--fl-text)]">
                  Read the file before adding it — {WORKFLOW_PATH}
                </summary>
                <pre
                  data-testid="workflow"
                  className="mt-2 max-h-72 overflow-auto whitespace-pre text-[11.5px] leading-snug text-[var(--fl-text)]"
                >
                  {workflow}
                </pre>
              </details>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={addOnGitHubUrl(repo, workflow)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fl-btn fl-btn-primary"
                >
                  Add it on GitHub
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(workflow).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    );
                  }}
                  className="rounded-lg border border-[var(--fl-border)] px-2.5 py-1 text-[12.5px] text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
                >
                  {copied ? "Copied" : "Copy the file"}
                </button>
                <span className="text-[12px] text-[var(--fl-muted)]">
                  Opens github.com with the file filled in; commit it there to turn it on.
                </span>
              </div>
            </>
          )
        )}
      </div>
    </Dialog>
  );
}
