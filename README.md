# mdnotion

mdnotion is an open-source, Notion-style markdown notes editor where your own GitHub repository is the entire backend. We never store a single line of your notes.

Users write notes with live rendered previews, organize them Notion-style with nested pages and frontmatter "database" properties, draw diagrams intuitively, export to PDF/DOCX/HTML/LaTeX/EPUB, and commit changes straight to GitHub. 

## Features

- **GitHub as the Backend**: No vendor lock-in. Your data survives and belongs to you.
- **Tiptap Block Editor**: Notion-like block editing experience with Slash Menu (`/`) and drag handles.
- **WYSIWYG ⇄ Raw Markdown**: Seamlessly toggle between rich text and raw markdown editing.
- **Frontmatter Support**: Maintain structured document metadata easily in the "Properties" panel.
- **Live Markdown Syncing**: Markdown rendering works hand-in-hand with our custom AST sync engine.
- **Zero-knowledge Collaboration**: WebRTC and Redis-based transient memory for real-time collaboration.

## Architecture

mdnotion is managed as a Turborepo monorepo:

### Apps
- `apps/web`: The Next.js 14 App Router frontend application.
- `apps/collab-server`: Hocuspocus WebSockets server for real-time collaboration.

### Packages
- `packages/editor`: The core Tiptap rich text block editor with Waypoint design tokens.
- `packages/github-client`: Octokit wrapper to interact with the GitHub API for read/write/commit/PR.
- `packages/markdown-engine`: Unified/Remark/Rehype AST engine to parse markdown and frontmatter.
- `packages/types`: Shared TypeScript typings for the monorepo.

## Getting Started

### Prerequisites

- Node.js >= 20.9.0
- pnpm >= 9.0.0

### Local Development

1. **Clone the repo**
   ```bash
   git clone https://github.com/praneeth132006/MarkDown.git mdnotion
   cd mdnotion
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start the development server**
   ```bash
   pnpm dev
   ```

   This will spin up all the applications in parallel. The frontend will be available at `http://localhost:3000`.

## Building for Production

```bash
pnpm build
```

## Contributing

We welcome contributions from the community! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## Security

If you discover a security vulnerability within mdnotion, please follow our [Security Policy](SECURITY.md).

## License

Distributed under the Apache 2.0 License. See `LICENSE` for more information.
