# Architecture

How ForkLeaf is put together, and why.

## The core idea

There is no ForkLeaf database. Notes are markdown files in the user's own GitHub
repository, and the app is a client for that repository plus a local cache.

Everything else follows from that constraint:

- **Storage is the user's problem, in a good way.** No hosting costs, no quotas,
  no migration, no "export my data" feature to build — the data was never ours.
- **Version history is free.** Git already does this better than an app-level
  revision system would.
- **The app must work offline**, because a note app that needs the network to
  accept a keystroke is not usable.
- **Commit history must stay readable**, because it is a real repository the
  user will look at.

## Data flow

```mermaid
flowchart TD
    Type([Keystroke]) --> Editor

    subgraph Browser
        Editor[Editor component]
        Repo[NoteRepository]
        DB[(IndexedDB)]
        Sync[SyncEngine]
        Queue[Change queue]

        Editor --> Repo
        Repo --> DB
        Repo --> Sync
        Sync --> Queue
        Queue --> Coalesce{Coalesce}
        Coalesce --> Debounce{Debounce 4s}
    end

    Debounce --> Gateway[GitHubGateway]
    Gateway --> Route["/api/gh/commit"]

    subgraph Server
        Route --> Cookie[(Encrypted session cookie)]
        Route --> Client[GitHubClient]
    end

    Client --> GitHub[(GitHub repository)]
```

The important property: the path from keystroke to durable storage is
`Editor → Repository → IndexedDB` and nothing else. The network is downstream of
that, always.

## Packages

### `@forkleaf/types`

The shared domain model. Everything is plain serialisable data — no classes, no
`Date` objects — because these values travel through `structuredClone` into
IndexedDB and across the network.

### `@forkleaf/markdown-engine`

Frontmatter parsing, document analysis and sanitised rendering.

Frontmatter is parsed by hand rather than with gray-matter: gray-matter pulls in
Node's `Buffer` and a much larger YAML stack, and this parser runs in the browser
on every keystroke. Malformed YAML is never fatal — the raw text is kept as the
body so a broken property block can't destroy a note.

`render.ts` is a **security boundary**. Note content can come from any public
repository, so it is untrusted: raw HTML is escaped rather than rendered, and the
sanitiser uses an explicit allowlist.

`wikilinks.ts` implements `[[target]]`, `[[target|alias]]` and `[[target#anchor]]`
in the Obsidian dialect — a dialect rather than an invention, because the notes
are files whose whole point is that other tools can read them.

Extraction is pure text work against a code-masked copy of the source, so the
offsets it reports point back into the real document (the editor uses them) and
a link inside a fenced block is not a link. Resolution is a _separate_ step
against a candidate list, which is what keeps this package ignorant of
workspaces: it tries the literal path, then a case- and separator-folded path,
then the bare filename, then the title, and breaks a filename tie on the title
so `[[q3-roadmap]]` and `[[Q3 roadmap]]` land on the same note.

The link graph — backlinks and wanted pages — is rebuilt from scratch rather
than maintained incrementally. Keeping it current would mean tracking which
unresolved targets a newly created note now satisfies, which is exactly the kind
of bookkeeping that goes quietly stale; a full pass over a few thousand notes is
a few milliseconds of string work.

### `@forkleaf/github-client`

A hand-written GitHub REST client rather than Octokit. That choice buys explicit
control over the three behaviours the sync engine depends on:

1. **Conditional requests.** Tree listings send `If-None-Match`, so polling for
   remote changes costs no rate-limit quota.
2. **Rate-limit handling.** 403s are separated into permission denials and rate
   limits, with backoff driven by `retry-after` / `x-ratelimit-reset`.
3. **Atomic multi-file commits.** Writes go through the git data API
   (blob → tree → commit → ref), not the contents API, which can only touch one
   file per commit.

It also makes the client trivially testable with an injected `fetch`.

#### Commit squashing

Autosave naturally produces a commit per save, which would make the repository's
history useless. Two mechanisms prevent that:

1. **Coalescing** (in the store): repeated edits to one note collapse into a
   single pending change before anything is sent.
2. **Squashing** (here): if the branch head is a commit ForkLeaf made recently,
   the new commit adopts that commit's _parent_ while keeping its _tree_, and the
   ref is force-updated. The two commits collapse into one, and nothing the older
   commit introduced is lost.

Force-updating a ref is dangerous, so it is fenced in:

- only when the head commit's message carries ForkLeaf's marker
- only within the configured window (default 5 minutes)
- never when the head commit has zero or multiple parents
- the branch head is re-read immediately before the push; if it moved, the whole
  operation falls back to an ordinary commit

Every one of those conditions has a test in `client.test.ts`.

### `@forkleaf/store`

Local-first storage and sync.

The engine depends on two **ports** — `LocalDatabase` and `RemoteGateway` — rather
than concrete implementations. That's what lets the entire sync engine be tested
in Node against in-memory fakes, and it is why `LocalGateway` can make the whole
app run with no GitHub account at all.

Key behaviours:

- **Coalescing rules** (`queue.ts`) are pure functions: repeated edits collapse;
  a note created and deleted before syncing never reaches GitHub; a rename of a
  never-synced note becomes a plain create; chained renames collapse to one move.
- **The original base SHA is preserved** across coalesced edits. Adopting a newer
  SHA would silently mask a remote edit that landed while the user was typing.
- **Conflicts** are detected by comparing the remote blob SHA against the SHA the
  edit was based on. On a mismatch the change is held back and the user chooses:
  keep local (rebase onto the remote SHA), keep remote, or keep both.
- **Failures are counted.** A change that can never succeed (revoked token,
  deleted repo) is dropped after five attempts rather than blocking the queue
  behind it forever.

#### Full-text search

`search-index.ts` is a plain inverted index with BM25 ranking, no dependency and
no worker. The notes are already in IndexedDB on this machine; shipping a search
engine to look through a few megabytes of prose that is in memory anyway would
be absurd.

Two decisions worth stating. Title and tags are boosted by _repeating them into
the token stream_ rather than as separate scored fields — the cheapest field
boosting there is, and BM25 decides how much they are worth instead of a
hand-tuned multiplier. Quoted phrases are checked against the stored text rather
than the index, because a positionless index cannot tell "note taking" from
"taking note", and storing positions to answer a rare query type is a bad trade
for an index living in a browser tab.

The index keeps each note's text so results can quote the line that matched.
That is its memory cost, and it is deliberate: "this note matched" is not an
answer.

#### Tabs

`tab-channel.ts` is a `BroadcastChannel` between ForkLeaf tabs. IndexedDB allows
one connection to hold a database across a version change, so a tab left open on
an older build blocks a newer one from opening at all — and has no idea it is
doing it. The old defence was an eight-second timeout ending in "close your
other tabs", which is a workaround, not a fix.

Now the blocked tab asks and the others let go. The timeout survives as a
backstop for browsers without the API. The request is re-sent alongside the
wait rather than trusted from IndexedDB's `blocked` callback, which fires at the
_start_ of a wait the retry code only reaches the _end_ of — any reply to it was
discarded seconds earlier.

### `@forkleaf/diagrams`

Mermaid support, split into pure logic and rendering.

`graph-model.ts` is the interesting part: a bidirectional mapping between Mermaid
flowchart source and a `{nodes, edges}` graph. The visual builder edits the graph;
the source editor edits the text; both stay in sync because the mapping round
trips. Node positions are stored in a `%% forkleaf:layout` comment, which Mermaid
ignores and GitHub renders fine.

The parser is deliberately forgiving — it runs against half-typed source as the
user works, so unrecognised lines are skipped rather than throwing.

### `@forkleaf/exporter`

Everything is generated in the browser. No upload, no conversion service, no
per-export cost, and a private note stays on the machine.

- **HTML/PDF**: markdown → sanitised HTML with diagrams spliced in as SVG. PDF
  goes through the browser's own print pipeline, which is the only way to get
  real selectable text without shipping a rendering engine.
- **DOCX**: walks the mdast tree rather than converting HTML, so headings become
  real Word heading styles and lists become real Word lists.

### `@forkleaf/editor`

React editing surfaces. Built directly on CodeMirror 6 rather than a React
wrapper, because wrappers that replace the whole document on every prop change
destroy the cursor position and undo history — unusable in an autosaving editor.

Diagrams are stored as ordinary ` ```mermaid ` fenced blocks. The Tiptap node
serialises to a fence and, crucially, parses fences back into diagram nodes — so
reopening a note doesn't downgrade its diagrams to code blocks, and a note
written here renders correctly on github.com.

Wikilinks in the rich-text editor are **decorations, not a node type**. A node
would need the markdown serialiser taught to write it back out, and any gap in
that round trip destroys a user's file. Decorations touch the document not at
all: the text stays `[[target]]` and only its painting and its click behaviour
change. The cost is that the brackets stay visible, which is a fair price in a
format whose entire promise is that the file is still the file.

One repair is applied on the way out. prosemirror-markdown escapes every `[` it
writes — correct for text that might be read as a link, catastrophic for this
one, since a wikilink typed in the rich editor was saved as `\[\[Roadmap\]\]`
and is not a wikilink to Obsidian, github.com, or ForkLeaf's own next load. The
unescape is targeted at the full `[[…]]` shape so a bracket escaped on purpose
survives.

### `@forkleaf/web`

The Next.js app: OAuth, the GitHub proxy routes, and the application shell.

The token never reaches the browser. It is encrypted into an httpOnly cookie and
every GitHub call is proxied through `/api/gh/*`. See [SECURITY.md](../SECURITY.md).

#### Publishing

`/api/gh/publish` renders a note to one self-contained page, commits it to
`docs/` in the repository the note already lives in, and switches on GitHub
Pages. There is no ForkLeaf hosting for the same reason there is no ForkLeaf
database.

The commit happens _before_ Pages is touched, so a repository that cannot serve
pages — a private one on a free plan, most often — still ends up with the file,
and switching Pages on later publishes it with no further work. Unpublishing
deletes the page and leaves Pages itself on: it is a repository-wide setting the
user may have had before ForkLeaf existed.

The slug is validated as given rather than normalised first. Normalising would
quietly turn `../index` into `index` and publish it — a rewrite nobody asked
for, at an address the note is not called.

#### Files on the user's machine

The manifest declares `file_handlers`, so an installed ForkLeaf is registered
with the operating system as a Markdown handler; `window.launchQueue` delivers a
handle for whatever was double-clicked, and `lib/local-files.ts` reads and
writes through it.

A file opened this way becomes an ordinary note that happens to have a file
behind it — IndexedDB, sync, tabs, search, all unchanged. A second document kind
with its own storage would have bought nothing. Disk writes happen on ⌘S only,
never on a keystroke: local storage already holds every character, and an editor
that continuously rewrites a file in someone's home directory without being
asked is not one to leave running.

Handles are held for the session and not persisted. They are structured-
cloneable and _could_ go into IndexedDB, but that needs a new object store, and
a new store needs a `DB_VERSION` bump — the one change that can leave another
tab unable to open the database. Not worth it to save one re-open.

## Testing strategy

Tests target logic where a bug means lost data or a security hole:

| Area              | What's covered                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `github-client`   | Commit ordering, batching, renames, every squash guard, error classification, base64 round-trip                       |
| `store`           | Coalescing rules, debouncing, offline queueing, restart recovery, all three conflict resolutions, retry limits        |
| `markdown-engine` | Frontmatter edge cases (CRLF, broken YAML, `---` rules), XSS vectors, path traversal, wikilink parsing and resolution |
| `diagrams`        | Mermaid ⇄ graph round trip for every shape and edge style, template validity, error messages                          |
| `search`          | Ranking, AND semantics, phrase queries, prefix matching, removal, snippet selection                                   |
| `publish`         | Slug validation — the string that becomes a path in the user's repository and a public URL                            |

UI components are verified by hand and by the production build. The tests that
exist are the ones worth maintaining.

## Deliberate non-goals

- **Real-time collaborative editing.** It needs an always-on server, and it
  conflicts with git-based versioning. GitHub already provides collaboration
  through branches and pull requests.
- **A hosted storage tier.** The entire premise is that we don't hold your notes.
- **Server-side export.** It costs money to run and, done carelessly (shelling
  out to pandoc with `--pdf-engine=xelatex` on user input), is a remote-code-
  execution hazard.
- **A service worker.** Notes are already offline-safe, because every one is
  written to IndexedDB before anything else happens. A second, staler cache of
  the app shell would buy a class of "why am I running last week's build" bugs
  in exchange for a cold start that is already fast. Installability does not
  need one.
- **A native desktop shell.** Tauri or Electron would mean a second build
  toolchain, a second update channel and a second set of platform bugs, to
  deliver what the manifest's `file_handlers` and the File System Access API
  already do: appearing in "Open with" and writing the file you opened.
