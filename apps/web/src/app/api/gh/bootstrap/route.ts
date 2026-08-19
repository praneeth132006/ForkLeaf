import { type NextRequest } from "next/server";
import { handle, requireClient, normalize } from "@/lib/api-helpers";
import type { RepoRef } from "@forkleaf/types";

const DEFAULT_REPO_NAME = "forkleaf-notes";

/**
 * Creates a notes repository on request.
 *
 * Called from the repository chooser when the user picks "create a new one" —
 * never automatically. Creates the repo if it does not exist, seeds it with a
 * welcome note, and returns the workspace to open. Idempotent: running it
 * against an existing repo just returns that repo untouched.
 *
 * With `scaffold`, the seed is a small folder layout rather than a single note,
 * so a fresh repo starts organised instead of accumulating notes flat at the
 * root. Git has no empty directories, so each folder is created by the one
 * starter note that explains what belongs in it.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client, login } = await requireClient();

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      directory?: string;
      private?: boolean;
      scaffold?: boolean;
    };

    const name = body.name?.trim() || DEFAULT_REPO_NAME;
    const directory = normalize(body.directory ?? "");

    const repo = await client.ensureRepo({
      owner: login,
      name,
      private: body.private ?? true,
    });

    const ref: RepoRef = {
      owner: repo.owner,
      repo: repo.name,
      branch: repo.defaultBranch,
      directory,
    };

    // Seed only when the workspace is genuinely empty, so this never reappears
    // after the user deletes it.
    const tree = await client.listTree(ref);
    let seeded = false;

    if (tree.length === 0) {
      const files = body.scaffold ? SCAFFOLD : [{ path: "welcome.md", content: WELCOME_NOTE }];

      await client.commitChanges(
        ref,
        files.map((file) => ({
          op: "upsert" as const,
          path: join(directory, file.path),
          content: file.content,
        })),
        { message: body.scaffold ? "set up notes structure" : "add welcome note" },
      );
      seeded = true;
    }

    return { repo, workspace: ref, seeded };
  });
}

function join(directory: string, path: string): string {
  return directory ? `${directory}/${path}` : path;
}

const WELCOME_NOTE = `---
title: Welcome to ForkLeaf
tags:
  - getting-started
---

# Welcome to ForkLeaf

This note lives in **your own GitHub repository**. Every edit becomes a commit,
so you get version history, backups and unlimited storage for free — and you can
walk away with your files at any time, because they are just markdown.

## Try these

- Type \`/\` on a new line to insert a heading, list, table or diagram.
- Switch between **Rich text**, **Split** and **Source** with the toggle above.
- Everything saves automatically, even offline.

## Diagrams are first class

Type \`/diagram\` to open the diagram builder: pick a template, drag shapes
around, or write Mermaid directly with autocomplete and inline help.

\`\`\`mermaid
flowchart LR
    Write([Write a note]) --> Save[Saved locally]
    Save --> Sync{Online?}
    Sync -->|Yes| Push[(Committed to GitHub)]
    Sync -->|No| Queue[Queued safely]
    Queue --> Push
\`\`\`

## Your files, your rules

| What | Where |
| --- | --- |
| Your notes | This repository |
| Your history | Standard git commits |
| Your exports | PDF, HTML, Word, Markdown |

Delete this note whenever you like — it will not come back.
`;

/**
 * The starting layout for a freshly created notes repository.
 *
 * Four folders, because more than that is a filing system nobody keeps up with:
 * somewhere to dump things fast, somewhere for notes that earned their place,
 * somewhere per project, and somewhere for what is finished. Every file here is
 * ordinary markdown — rename, move or delete any of it.
 */
const SCAFFOLD: ReadonlyArray<{ path: string; content: string }> = [
  {
    path: "README.md",
    content: `# Notes

Written with [ForkLeaf](https://github.com/praneeth132006/ForkLeaf). Every note is
a markdown file and every save is a commit, so this repository works just as well
without it.

## Layout

| Folder | What goes in it |
| --- | --- |
| \`inbox/\` | Anything captured in a hurry. Sort it later. |
| \`notes/\` | Notes worth keeping and coming back to. |
| \`projects/\` | One folder or file per project. |
| \`archive/\` | Finished or abandoned. Kept, not deleted. |

Nothing enforces this. Move things around whenever it stops fitting.
`,
  },
  {
    path: "inbox/capture.md",
    content: `---
title: Inbox
tags:
  - inbox
---

# Inbox

Things land here before you know where they go — a link, half a thought, something
from a meeting. The point is that capturing is fast and filing happens later.

Empty this out now and then: move what matters into \`notes/\` or a project, and
delete the rest.
`,
  },
  { path: "notes/welcome.md", content: WELCOME_NOTE },
  {
    path: "projects/first-project.md",
    content: `---
title: First project
tags:
  - project
---

# First project

Rename this file after something you are actually working on. When a project
outgrows one file, make it a folder — \`projects/my-project/\` — and put the notes
inside.

## Open questions

- [ ] What does done look like?

## Log

Newest first, so the current state is the first thing you read.
`,
  },
  {
    path: "archive/README.md",
    content: `# Archive

Finished, abandoned, or no longer true. Move things here instead of deleting them
— the history is in git either way, but this keeps the rest of the repository
about what is live.
`,
  },
];
