/** Canonical links, so a repository move is a one-line change. */
export const REPO_URL = "https://github.com/praneeth132006/ForkLeaf";
export const ISSUES_URL = `${REPO_URL}/issues`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const CONTRIBUTING_URL = `${REPO_URL}/blob/main/CONTRIBUTING.md`;
export const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md`;
export const ARCHITECTURE_URL = `${REPO_URL}/blob/main/docs/architecture.md`;
export const SPONSOR_URL = `https://github.com/sponsors/praneeth132006`;

/**
 * Where to write when something is wrong.
 *
 * The same address the legal pages give, on purpose: one inbox that answers
 * for the whole project is easier to trust than three that each answer for a
 * corner of it, and a support address nobody watches is worse than none.
 */
export const SUPPORT_EMAIL = "praneeth2006.dev@gmail.com";

/**
 * A pre-addressed message, so writing in is one click rather than a copy, a
 * paste and a subject line somebody has to invent.
 */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "ForkLeaf support",
)}`;
