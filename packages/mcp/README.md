# ForkLeaf MCP server

Lets an AI assistant — Claude Code, Claude Desktop, or anything else that
speaks the [Model Context Protocol](https://modelcontextprotocol.io) — search,
read and write your ForkLeaf notebook.

It talks to your notes repository on GitHub directly, with a token you give it.
Nothing goes through ForkLeaf's servers. Every write is an ordinary commit in
your repository, marked `forkleaf:`, so it is in the history and can be undone.

## The easy way: nothing to install

ForkLeaf serves these same tools at `https://www.forkleaf.in/api/mcp`, with
sign-in built in. Add that address to your assistant — for Claude Code,
`claude mcp add --transport http forkleaf https://www.forkleaf.in/api/mcp` —
and it opens ForkLeaf to choose a repository and sign in. No token to create.
In the editor, **All tools → Connect an AI assistant** has the step for each
assistant. The rest of this README is for running the server yourself.

## Tools

| Tool                     | What it does                                                                  |
| ------------------------ | ----------------------------------------------------------------------------- |
| `list_repositories`      | The repositories it can use, which is the default, which are read only        |
| `search_notes`           | Full-text search across every note, with the line each match is on            |
| `list_notes`             | The notes in the notebook, or in one folder                                   |
| `read_note`              | One note in full, with the notes that link to it                              |
| `write_note`             | Create a note, or replace one's whole content, as one commit                  |
| `append_to_daily_note`   | Add text to `journal/YYYY-MM-DD.md`, creating it if needed                    |
| `read_note_conversation` | A note's conversation (GitHub Discussions) and the threads about its passages |
| `list_conversations`     | Every conversation, newest first, or only the unanswered questions            |
| `read_conversation`      | One conversation in full, by number                                           |
| `reply_to_conversation`  | Post a reply under your name — only when you ask, after seeing the text       |

Every tool works on `FORKLEAF_REPO` unless it is given `repository: owner/name`
— which it can be when `FORKLEAF_ALL_REPOS=true`. Each write answers with the
repository, the full path and a link to the note on GitHub.

A new note goes in a folder that already has notes, in `inbox/`, or at the top.
A folder that does not exist yet is refused — with the list of folders there
are — unless the call passes `new_folder: true`, which the tool reserves for
when the person asked for a new folder. That is what keeps an assistant's notes
where you will find them.

## What it will not do

- Read or write anything but `.md` and `.mdx` notes, or anything in a hidden
  folder such as `.github`.
- Follow a path outside the notebook (`..`), or outside `FORKLEAF_DIR` when set.
- Show or overwrite an **encrypted note**. It does not have the passphrase, so
  it says the note is encrypted and leaves it alone.
- Write at all, when `FORKLEAF_READ_ONLY=true`: the two writing tools are not
  offered.

## Setup

1. Create a **fine-grained personal access token** on GitHub, limited to your
   notes repository, with **Contents: Read and write** (or **Read-only** if you
   will use read-only mode).
2. Add the server to your assistant. `npx` downloads and runs it; there is
   nothing else to install, and it needs Node 20 or newer.

### Claude Code

```bash
claude mcp add forkleaf \
  --env FORKLEAF_GITHUB_TOKEN=github_pat_... \
  --env FORKLEAF_REPO=you/notes \
  -- npx -y @forkleaf/mcp
```

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "forkleaf": {
      "command": "npx",
      "args": ["-y", "@forkleaf/mcp"],
      "env": {
        "FORKLEAF_GITHUB_TOKEN": "github_pat_...",
        "FORKLEAF_REPO": "you/notes"
      }
    }
  }
}
```

### From a checkout of ForkLeaf

Run `pnpm install` once, then use
`pnpm --silent --dir /path/to/ForkLeaf/packages/mcp start` as the command in
place of `npx -y @forkleaf/mcp`. `pnpm --filter @forkleaf/mcp build` produces
the same single-file server the npm package ships, at `dist/forkleaf-mcp.js`.

### Publishing (maintainers)

`pnpm --filter @forkleaf/mcp publish` builds the bundle and publishes it. Use
pnpm rather than npm: it swaps the `main` and `exports` fields for the bundle,
as `publishConfig` asks.

## Settings

| Variable                | Required | Meaning                                                 |
| ----------------------- | -------- | ------------------------------------------------------- |
| `FORKLEAF_GITHUB_TOKEN` | yes      | The token (`GITHUB_TOKEN` is also read)                 |
| `FORKLEAF_REPO`         | yes      | `owner/name` of your notes repository                   |
| `FORKLEAF_BRANCH`       | no       | Branch to use; defaults to the repository's default     |
| `FORKLEAF_DIR`          | no       | Folder the notes live in, when it is not the whole repo |
| `FORKLEAF_READ_ONLY`    | no       | `true` to offer only the tools that read                |
| `FORKLEAF_ALL_REPOS`    | no       | `true` to let tools name the token's other repositories |

Searching reads up to 300 notes, cached for 30 seconds. The server writes
nothing to stdout but protocol messages; problems are reported on stderr.
