import { SiteShell } from "@/components/SiteShell";
import { ProfilePanel } from "@/components/ProfilePanel";
import { getSession, githubOAuthConfigured } from "@/lib/session";

export const metadata = {
  title: "Your profile",
  description:
    "Your ForkLeaf profile: connected GitHub identity, repositories, what you have written, and how the editor behaves.",
};

export default async function ProfilePage() {
  const session = await getSession();

  return (
    <SiteShell>
      <ProfilePanel user={session?.user ?? null} githubAvailable={githubOAuthConfigured()} />
    </SiteShell>
  );
}
