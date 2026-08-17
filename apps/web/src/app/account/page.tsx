import React from "react";
import { SiteShell } from "@/components/SiteShell";
import { AccountPanel } from "@/components/AccountPanel";
import { getSession, githubOAuthConfigured } from "@/lib/session";

export const metadata = {
  title: "Account & plan",
  description: "Your ForkLeaf account, connected GitHub identity, and current plan.",
};

export default async function AccountPage() {
  const session = await getSession();

  return (
    <SiteShell>
      <AccountPanel user={session?.user ?? null} githubAvailable={githubOAuthConfigured()} />
    </SiteShell>
  );
}
