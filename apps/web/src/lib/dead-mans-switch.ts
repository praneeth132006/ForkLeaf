/**
 * If I stop writing: a GitHub Action, in your own repository, that acts when
 * the notebook has gone quiet.
 *
 * Notes outlive the app that made them only if somebody can reach them. This
 * writes a workflow that runs once a day on GitHub's own machines — no
 * ForkLeaf server, no account of ours — and counts the days since anything
 * was last written. Two weeks before the limit it opens an issue to remind
 * you: write anything and the clock starts again. At the limit it does what
 * you chose, once:
 *
 * - copies one folder into `docs/`, where GitHub Pages publishes it, and/or
 * - opens an issue naming someone you trust, so GitHub tells them.
 *
 * It never deletes anything and never changes who can see the repository.
 * Turning it off is deleting the file. Its own bookkeeping lives under
 * `.forkleaf/` and, with the workflow itself, is not counted as writing — so
 * the switch cannot keep itself alive.
 *
 * Every value that reaches the file is checked against a closed pattern
 * first: this text runs as a shell script on GitHub, and nothing typed into a
 * form should be able to add a command to it.
 */

export const WORKFLOW_PATH = ".github/workflows/forkleaf-if-i-stop-writing.yml";

export interface SwitchSettings {
  /** Days without writing before it acts. */
  days: number;
  /** Folder to publish through GitHub Pages, or null to publish nothing. */
  folder: string | null;
  /** GitHub username to notify, or null to notify nobody else. */
  person: string | null;
}

export type SwitchProblem = "days" | "folder" | "person" | "nothing";

const FOLDER = /^(?!.*\.\.)(?!\/)[A-Za-z0-9][A-Za-z0-9 _.\-/]{0,120}$/;
const USERNAME = /^(?!-)[A-Za-z0-9-]{1,39}$/;
const WARNING_DAYS = 14;

/** What is wrong with the settings, if anything. */
export function checkSwitch(settings: SwitchSettings): SwitchProblem | null {
  if (!Number.isInteger(settings.days) || settings.days < 30 || settings.days > 3650) return "days";
  if (settings.folder !== null && (!FOLDER.test(settings.folder) || /\/$/.test(settings.folder)))
    return "folder";
  if (settings.person !== null && !USERNAME.test(settings.person)) return "person";
  if (settings.folder === null && settings.person === null) return "nothing";
  return null;
}

/** The workflow, as YAML. Throws on settings `checkSwitch` would refuse. */
export function switchWorkflow(settings: SwitchSettings): string {
  const problem = checkSwitch(settings);
  if (problem) throw new Error(`Invalid switch settings: ${problem}`);
  const { days, folder, person } = settings;
  const warnAt = Math.max(1, days - WARNING_DAYS);
  const mention = person ? `@${person}` : "";

  const release: string[] = [];
  if (folder) {
    release.push(
      `          mkdir -p "docs/${folder}"`,
      `          cp -R "${folder}/." "docs/${folder}/"`,
    );
  }
  release.push(
    "          mkdir -p .forkleaf",
    "          date -u +%F > .forkleaf/switch-fired",
    '          git config user.name "ForkLeaf switch"',
    '          git config user.email "switch@users.noreply.github.com"',
    "          git add -A docs .forkleaf",
    `          git commit -m "If I stop writing: ${days} days without a note"`,
    "          git push",
  );
  const notice = folder
    ? `This notebook has had nothing written in ${days} days, so the folder ${folder} has been copied to docs/${folder}, where GitHub Pages publishes it if Pages is on.`
    : `This notebook has had nothing written in ${days} days.`;
  if (person) {
    release.push(
      `          gh issue create --title "If I stop writing: ${days} days without a note" --body "${mention} ${notice} You were named as the person to tell."`,
    );
  }

  return `# Made by ForkLeaf. Acts when nothing has been written here for ${days} days.
# Delete this file to turn it off. It never deletes notes or changes who can see them.
name: If I stop writing

on:
  schedule:
    - cron: "17 6 * * *"
  workflow_dispatch:

permissions:
  contents: write
  issues: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Days since anything was written
        id: quiet
        run: |
          last=$(git log -1 --format=%ct -- . ':(exclude).github' ':(exclude).forkleaf')
          echo "days=$(( ( $(date +%s) - \${last:-$(date +%s)} ) / 86400 ))" >> "$GITHUB_OUTPUT"

      - name: Remind the owner first
        if: \${{ steps.quiet.outputs.days == '${warnAt}' && hashFiles('.forkleaf/switch-fired') == '' }}
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          gh issue create --title "Nothing written for ${warnAt} days" --body "@\${{ github.repository_owner }} In ${WARNING_DAYS} days the If I stop writing switch acts. Write or change any note to start the count again."

      - name: Act, once
        if: \${{ fromJSON(steps.quiet.outputs.days) >= ${days} && hashFiles('.forkleaf/switch-fired') == '' }}
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
${release.join("\n")}
`;
}

/**
 * github.com's "new file" page with the workflow filled in, so the owner adds
 * it with their own commit, reading it first.
 */
export function addOnGitHubUrl(
  repo: { owner: string; repo: string; branch: string },
  workflow: string,
): string {
  const params = new URLSearchParams({ filename: WORKFLOW_PATH, value: workflow });
  return `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/new/${encodeURIComponent(repo.branch)}?${params.toString()}`;
}
