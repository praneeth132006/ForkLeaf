import { type NextRequest } from "next/server";
import { handle, requireClient, normalize } from "@/lib/api-helpers";
import type { RepoRef } from "@forkleaf/types";

const DEFAULT_REPO_NAME = "forkleaf-notes";

/**
 * Sets up the user's default notes repository.
 *
 * Called once after sign-in. Creates a private `forkleaf-notes` repo if it does
 * not exist, seeds it with a welcome note, and returns the workspace to open.
 * Idempotent — running it against an existing repo just returns that repo.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client, login } = await requireClient();

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      directory?: string;
      private?: boolean;
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

    // Seed a welcome note only when the workspace is genuinely empty, so this
    // never reappears after the user deletes it.
    const tree = await client.listTree(ref);
    let seeded = false;

    if (tree.length === 0) {
      await client.commitChanges(
        ref,
        [{ op: "upsert", path: welcomePath(directory), content: WELCOME_NOTE }],
        { message: "add welcome note" },
      );
      seeded = true;
    }

    return { repo, workspace: ref, seeded };
  });
}

function welcomePath(directory: string): string {
  return directory ? `${directory}/welcome.md` : "welcome.md";
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
