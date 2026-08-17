# Contributing to ForkLeaf

Thanks for wanting to help. This document should get you from a clean clone to a
merged pull request without guesswork.

## Getting set up

```bash
git clone https://github.com/praneeth132006/ForkLeaf.git
cd MarkDown
pnpm install
pnpm dev
```

You need **Node.js 20.9+** and **pnpm 9+**.

You do **not** need a GitHub OAuth app to develop. With no configuration the app
runs in local mode with notes in IndexedDB, and everything except GitHub sync
works normally. Only touch `.env.local` if you're specifically working on sync
or auth (see [README](README.md#connect-github)).

## Before you open a pull request

```bash
pnpm check
```

That runs formatting, typechecking, linting, the test suite and a production
build — the same things CI runs. If it passes locally it should pass in CI.

Individually:

```bash
pnpm test           # vitest
pnpm test:watch     # vitest, watching
pnpm typecheck      # tsc across every package
pnpm lint           # eslint
pnpm format         # prettier --write
```

## How the repo is laid out

```
apps/web/            Next.js app — routes, API, application shell
packages/
  types/             Shared domain model
  markdown-engine/   Frontmatter, parsing, rendering, paths
  github-client/     GitHub REST client
  store/             IndexedDB + sync engine
  diagrams/          Mermaid rendering, templates, graph model
  exporter/          Client-side exports
  editor/            React editing components
docs/                Architecture and self-hosting guides
```

Packages ship TypeScript source; Next compiles them via `transpilePackages`.
There's no inter-package build step, so changes hot-reload everywhere.

## Conventions

**Comments explain why, not what.** The codebase leans on short comments that
capture the reasoning behind a non-obvious decision. Please match that. A
comment restating the code is noise; a comment explaining why the sync engine
keeps the _original_ base SHA is the difference between someone understanding
the code and someone breaking it.

**Tests for logic, not for React.** The valuable tests here cover pure logic:
the queue coalescing rules, commit squashing, the Mermaid graph round-trip,
frontmatter parsing. If you add logic like that, add tests. UI components are
verified by hand and by the build.

**Type safety is not optional.** `strict` plus `noUncheckedIndexedAccess` are on.
Please don't reach for `any` to get past a type error — if the types are genuinely
in the way, say so in the PR and we'll work it out.

**Small PRs.** One change per pull request is much easier to review than five.

## Where the tricky parts are

If you're changing any of these, please read the surrounding comments carefully
and run the tests:

- **`packages/github-client/src/client.ts` — `commitChanges`.** Commit squashing
  force-updates a git ref. The guards around it (only our own commits, only
  recent ones, never a root commit, re-check the head before pushing) exist to
  make sure we can never destroy someone else's work. `client.test.ts` covers
  every one of those cases.

- **`packages/store/src/queue.ts` and `sync-engine.ts`.** These decide what
  reaches GitHub and when. Bugs here mean lost notes. Well covered by tests.

- **`packages/markdown-engine/src/render.ts`.** Note content is untrusted — it
  can come from any public repo the user opens. The sanitiser is a security
  boundary, not a formatting choice.

- **`packages/diagrams/src/graph-model.ts`.** The Mermaid ⇄ graph round trip is
  what lets the visual builder and source editor coexist. Changes need to keep
  round-tripping; the tests check every shape and edge style.

## Good first issues

- Add a diagram template to `packages/diagrams/src/templates.ts` (the tests will
  automatically check that it declares the right type and, for flowcharts, that
  the visual builder can open it).
- Add Mermaid completions for a diagram type in `completions.ts`.
- Improve an error message in `packages/diagrams/src/errors.ts`.
- Add keyboard shortcuts, or a command palette.
- Improve mobile layout for the editor shell.

## Reporting bugs

Please include what you expected, what happened, and the smallest note content
that reproduces it. If it involves sync, the status-bar text at the time is very
useful.

## Security

Please don't file security issues publicly — see [SECURITY.md](SECURITY.md).

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contributions are licensed under the
Apache License 2.0.
