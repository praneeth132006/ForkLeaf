import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { getSession, githubOAuthConfigured } from "@/lib/session";

export const metadata = {
  title: "Dashboard — ForkLeaf",
  description:
    "Every note you have written, indexed and searchable, across each GitHub repository you have connected.",
};

/**
 * Where signing in lands.
 *
 * The session is read on the server so the page renders with the right identity
 * on the first paint; everything below it — the note index, the repositories,
 * the statistics — is read from this device, because ForkLeaf keeps no copy of
 * anybody's notes.
 */
export default async function DashboardPage() {
  const session = await getSession();

  return <DashboardPanel user={session?.user ?? null} githubAvailable={githubOAuthConfigured()} />;
}
