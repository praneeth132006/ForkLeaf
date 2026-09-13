# ForkLeaf MCP server

Lets an AI assistant — Claude Code, Claude Desktop, or anything else that
speaks the [Model Context Protocol](https://modelcontextprotocol.io) — search,
read and write your ForkLeaf notebook.

It talks to your notes repository on GitHub directly, with a token you give it.
Nothing goes through ForkLeaf's servers. Every write is an ordinary commit in
your repository, marked `forkleaf:`, so it is in the history and can be undone.

## The easy way: nothing to install

ForkLeaf serves these same tools at `https://forkleaf.vercel.app/api/mcp`, with
sign-in built in. Add that address to your assistant — for Claude Code,
`claude mcp add --transport http forkleaf https://forkleaf.vercel.app/api/mcp` —
and it opens ForkLeaf to choose a repository and sign in. No token to create.
In the editor, **All tools → Connect an AI assistant** has the step for each
assistant. The rest of this README is for running the server yourself.

## Tools

| Tool                   | What it does                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `search_notes`         | Full-text search across every note, with the line each match is on |
| `list_notes`           | The notes in the notebook, or in one folder                        |
| `read_note`            | One note in full, with the notes that link to it                   |
| `write_note`           | Create a note, or replace one's whole content, as one commit       |
| `append_to_daily_note` | Add text to `journal/YYYY-MM-DD.md`, creating it if needed         |

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
2. From the ForkLeaf checkout, install once: `pnpm install`.
3. Add the server to your assistant.

### Claude Code

```bash
claude mcp add forkleaf \
  --env FORKLEAF_GITHUB_TOKEN=github_pat_... \
  --env FORKLEAF_REPO=you/notes \
  -- pnpm --silent --dir /path/to/ForkLeaf/packages/mcp start
```

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "forkleaf": {
      "command": "pnpm",
      "args": ["--silent", "--dir", "/path/to/ForkLeaf/packages/mcp", "start"],
      "env": {
        "FORKLEAF_GITHUB_TOKEN": "github_pat_...",
        "FORKLEAF_REPO": "you/notes"
      }
    }
  }
}
```

## Settings

| Variable                | Required | Meaning                                                 |
| ----------------------- | -------- | ------------------------------------------------------- |
| `FORKLEAF_GITHUB_TOKEN` | yes      | The token (`GITHUB_TOKEN` is also read)                 |
| `FORKLEAF_REPO`         | yes      | `owner/name` of your notes repository                   |
| `FORKLEAF_BRANCH`       | no       | Branch to use; defaults to the repository's default     |
| `FORKLEAF_DIR`          | no       | Folder the notes live in, when it is not the whole repo |
| `FORKLEAF_READ_ONLY`    | no       | `true` to offer only the tools that read                |

Searching reads up to 300 notes, cached for 30 seconds. The server writes
nothing to stdout but protocol messages; problems are reported on stderr.
