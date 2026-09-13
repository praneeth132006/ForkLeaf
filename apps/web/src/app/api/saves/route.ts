import { type NextRequest } from "next/server";
import type { FileChange, GitHubClient } from "@forkleaf/github-client";
import type { RepoRef } from "@forkleaf/types";
import { ApiError, handle, requireClient } from "@/lib/api-helpers";
import { parseSaveRequest } from "@/lib/inbox";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  INDEX_JSON,
  INDEX_MD,
  SAVES_REPO,
  entryFor,
  findDuplicate,
  indexJson,
  indexMarkdown,
  parseIndex,
  saveDocument,
  savePath,
  savesReadme,
  withEntry,
} from "@/lib/saves";

/**
 * Saves from the web, into a repository kept for them.
 *
 * `POST` files one page, quote, link or image into `forkleaf-saves` — created,
 * private, on the first save — and rewrites the index in the same commit.
 * `GET` lists everything saved, for the grid in the editor.
 *
 * The request is validated by the same parser the save address uses, so an
 * address, a title and words arrive here held to exactly the rules they were
 * shown under.
 */

/** A save racing another moves the branch under it; read again and retry. */
const ATTEMPTS = 3;

function linksFor(ref: RepoRef) {
  const url = `https://github.com/${ref.owner}/${ref.repo}`;
  return {
    owner: ref.owner,
    name: ref.repo,
    branch: ref.branch,
    url,
    index: `${url}/blob/${ref.branch}/${INDEX_MD}`,
  };
}

async function existingRepo(client: GitHubClient, login: string): Promise<RepoRef | null> {
  const repo = await client.getRepo(login, SAVES_REPO);
  return repo
    ? { owner: repo.owner, repo: repo.name, branch: repo.defaultBranch, directory: "" }
    : null;
}

export async function GET() {
  return handle(async () => {
    const { client, login } = await requireClient();
    const ref = await existingRepo(client, login);
    if (!ref) return { repo: null, items: [] };

    const file = await client.readFile(ref, INDEX_JSON);
    return { repo: linksFor(ref), items: parseIndex(file?.content) };
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client, login } = await requireClient();
    enforceRateLimit(request, { name: "saves", limit: 30, windowMs: 60_000 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new ApiError(400, "validation", "Expected a JSON body.");

    const params = new URLSearchParams({ save: "1" });
    for (const key of ["kind", "url", "title", "text"]) {
      const value = body[key];
      if (typeof value === "string") params.set(key, value);
    }
    const saveRequest = parseSaveRequest(params);
    if (!saveRequest) {
      throw new ApiError(
        400,
        "validation",
        "There is nothing to save — no address, words or title.",
      );
    }

    const repo = await client.ensureRepo({ owner: login, name: SAVES_REPO, private: true });
    const ref: RepoRef = {
      owner: repo.owner,
      repo: repo.name,
      branch: repo.defaultBranch,
      directory: "",
    };

    for (let attempt = 1; ; attempt += 1) {
      const indexFile = await client.readFile(ref, INDEX_JSON);
      const entries = parseIndex(indexFile?.content);

      if (body.force !== true) {
        const existing = findDuplicate(entries, saveRequest);
        if (existing) {
          return { saved: false, existing, repo: linksFor(ref), private: repo.private };
        }
      }

      const now = new Date();
      const document = saveDocument(saveRequest, now);
      const taken = new Set(entries.map((entry) => entry.path));
      let path = savePath({ ...saveRequest, title: document.title }, now, taken);
      // The index is the app's record, but a file can be added by hand on
      // github.com. Never write over one.
      for (let checks = 0; checks < 5 && (await client.readFile(ref, path)); checks += 1) {
        taken.add(path);
        path = savePath({ ...saveRequest, title: document.title }, now, taken);
      }

      const entry = entryFor(path, saveRequest, document);
      const next = withEntry(entries, entry);
      const changes: FileChange[] = [
        { op: "upsert", path, content: document.markdown },
        { op: "upsert", path: INDEX_JSON, content: indexJson(next) },
        { op: "upsert", path: INDEX_MD, content: indexMarkdown(next) },
        // The first save replaces the one-line README GitHub created the
        // repository with, so it explains itself.
        ...(indexFile
          ? []
          : [{ op: "upsert" as const, path: "README.md", content: savesReadme() }]),
      ];

      try {
        await client.commitChanges(ref, changes, {
          message: `forkleaf: save ${saveRequest.kind} — ${document.title}`,
        });
        return { saved: true, entry, repo: linksFor(ref), private: repo.private };
      } catch (error) {
        if (attempt >= ATTEMPTS) throw error;
      }
    }
  });
}
