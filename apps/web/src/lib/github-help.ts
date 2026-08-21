"use client";

import type { SessionResponse } from "@/lib/gateway";

/**
 * Turning a GitHub refusal into something a person can act on.
 *
 * The three failures people actually hit all arrive looking similar and mean
 * completely different things:
 *
 *  - a private repository is invisible to a `public_repo` token, and GitHub
 *    reports it as *missing* rather than forbidden, so the app appears to be
 *    lying about a repository the user is looking at in another tab;
 *  - an organisation that has not approved this OAuth app produces the same
 *    silence, and the fix is not the user's to make — an owner has to grant it;
 *  - an expired session is a 401 that says "Bad credentials", which is true
 *    and useless.
 *
 * Each one gets the sentence that fits it and the steps that end it.
 */

export interface AccessProblem {
  /** One sentence saying what happened. */
  summary: string;
  /** What to do about it, in order. */
  steps: string[];
  /** Where to go, when the fix is on GitHub or in this app. */
  action?: { label: string; href: string };
}

interface FailureLike {
  code?: string;
  status?: number;
  message?: string;
}

/** True for a session that cannot see private repositories at all. */
export function isPublicOnly(session: SessionResponse | null): boolean {
  const scopes = session?.scopes;
  if (!scopes || scopes.length === 0) return false;
  return !scopes.includes("repo") && scopes.includes("public_repo");
}

/** GitHub's own words for an organisation that has not approved this app. */
function mentionsOrgRestriction(message: string): boolean {
  return /organization has enabled OAuth App access restrictions|access restrictions/i.test(
    message,
  );
}

export function explainAccessFailure(
  error: unknown,
  session: SessionResponse | null,
): AccessProblem {
  const { code, status, message } = (error ?? {}) as FailureLike;
  const text = message ?? "";

  if (mentionsOrgRestriction(text)) {
    return {
      summary:
        "That repository belongs to an organisation that has not approved ForkLeaf yet, so GitHub is refusing on its behalf.",
      steps: [
        "An organisation owner opens the organisation's Settings → Third-party Access → OAuth App policy.",
        "They find ForkLeaf in the list and choose Grant access — or you press Request approval there, which sends it to them.",
        "Once granted, come back and connect the repository again. Nothing needs re-doing on this side.",
      ],
      action: {
        label: "Open GitHub's OAuth app settings",
        href: "https://github.com/settings/connections/applications",
      },
    };
  }

  if (code === "unauthorized" || status === 401) {
    return {
      summary: "Your GitHub sign-in has expired. Nothing is lost — your notes are on this device.",
      steps: [
        "Sign in again; the queue pushes everything waiting as soon as you do.",
        "If it expires repeatedly, revoke ForkLeaf at github.com/settings/applications and sign in once more.",
      ],
      action: { label: "Sign in again", href: "/sign-in" },
    };
  }

  if ((code === "not-found" || status === 404) && isPublicOnly(session)) {
    return {
      summary:
        "You signed in with access to public repositories only, so a private repository is invisible to ForkLeaf — GitHub reports it as missing rather than as private.",
      steps: [
        "If the repository is public, check the owner and name for a typo.",
        "If it is private, sign in again and choose “Private and public repositories”.",
        "Your notes and anything queued stay exactly where they are while you do.",
      ],
      action: { label: "Change what ForkLeaf can access", href: "/sign-in" },
    };
  }

  if (code === "not-found" || status === 404) {
    return {
      summary: "GitHub cannot find that repository for your account.",
      steps: [
        "Check the owner and repository name, and that the branch exists.",
        "If it belongs to an organisation, an owner may need to approve ForkLeaf under Third-party Access.",
        "If it is private and you signed in with public-only access, sign in again with the wider permission.",
      ],
      action: { label: "Check what ForkLeaf can access", href: "/sign-in" },
    };
  }

  if (code === "forbidden" || status === 403) {
    return {
      summary: "GitHub refused that. Usually it means the account cannot write to this repository.",
      steps: [
        "Check you have write access — read access is enough to open notes and not enough to save them.",
        "For an organisation repository, an owner may need to approve ForkLeaf under Third-party Access.",
      ],
      action: {
        label: "Open GitHub's OAuth app settings",
        href: "https://github.com/settings/connections/applications",
      },
    };
  }

  if (code === "rate-limited" || status === 429) {
    return {
      summary: "GitHub is asking us to slow down. This clears by itself, usually within a minute.",
      steps: [
        "Nothing to do — queued changes retry on their own.",
        "Your work is saved on this device in the meantime.",
      ],
    };
  }

  return {
    summary: text || "GitHub could not complete that request.",
    steps: [
      "Your notes are saved on this device, so nothing is lost.",
      "Try again in a moment; anything queued keeps retrying by itself.",
    ],
  };
}
