# Contributing to mdnotion

First off, thank you for considering contributing to mdnotion! It's people like you that make mdnotion such a great tool for developers and writers.

## Development Workflow

1. **Fork the Repository**: Start by forking the repository to your own GitHub account.
2. **Clone Locally**: Clone your fork to your local machine.
3. **Create a Branch**: Create a new branch for your feature or bugfix. We recommend naming it descriptively, e.g., `feat/my-new-feature` or `fix/issue-123`.
4. **Install Dependencies**: Run `pnpm install` in the root directory.
5. **Make Changes**: Make your changes across the monorepo. Ensure you're adhering to the Waypoint design system if touching the frontend.
6. **Test Your Changes**: Verify that the application still builds successfully with `pnpm build`.
7. **Commit Your Changes**: We enforce conventional commits. Please write clear, concise commit messages.
8. **Push and PR**: Push to your fork and submit a Pull Request against the `main` branch.

### Architecture Guidelines

- **GitHub as Source of Truth**: GitHub is the only source of truth for content. If a feature intends to store note text/markdown in a proprietary database, it will be rejected.
- **Design System**: Use the provided `Waypoint` design tokens (basalt, paper, fog, chalk, ink, signal-amber, trail-teal, ember, mist, contour) and typography (Fraunces, Public Sans, JetBrains Mono) defined in Tailwind.

## Code Style

- Use `eslint` and `prettier` (handled via Next.js standard linting).
- Keep components modular.
- The `packages/editor` should be purely presentation and AST mapping, without containing business logic tied to Next.js data fetching.

## Submitting Pull Requests

- Provide a clear description of what the PR achieves.
- If it fixes an open issue, link to the issue.
- Ensure that the GitHub Actions CI pipeline passes before asking for a review.
