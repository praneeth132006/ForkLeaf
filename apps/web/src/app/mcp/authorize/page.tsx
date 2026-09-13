import type { Metadata } from "next";
import { McpConsent } from "@/components/McpConsent";
import { openClient } from "@/lib/mcp-grants";
import { readAuthorizeRequest } from "@/lib/mcp-oauth";

export const metadata: Metadata = {
  title: "Connect an AI assistant",
  robots: { index: false },
};

/**
 * Where an assistant sends someone to say yes.
 *
 * The request is checked here, on the server, before anything is shown: a
 * client id this server did not seal, or an answer address the client never
 * registered, gets an explanation and no button — never a redirect to an
 * address nobody vouched for.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
  }

  if (params.get("resume") === "1") {
    return (
      <Shell>
        <McpConsent resume />
      </Shell>
    );
  }

  const parsed = readAuthorizeRequest(params);
  let problem: string | null = parsed.ok ? null : parsed.error;
  let clientName = "";

  if (parsed.ok) {
    const registered = await openClient(parsed.value.clientId).catch(() => null);
    if (!registered) {
      problem =
        "This sign-in link did not come from an assistant ForkLeaf recognises. Start connecting again from your assistant.";
    } else if (!registered.redirectUris.includes(parsed.value.redirectUri)) {
      problem =
        "This sign-in link would send you somewhere the assistant never registered, so it has been stopped. Start again from your assistant.";
    } else {
      clientName = registered.clientName;
    }
  }

  return (
    <Shell>
      {problem || !parsed.ok ? (
        <div className="fl-card w-full max-w-lg p-6">
          <h1 className="text-lg font-semibold text-[var(--fl-text)]">
            This connection cannot continue
          </h1>
          <p className="mt-2 text-[14px] text-[var(--fl-muted)]">{problem}</p>
        </div>
      ) : (
        <McpConsent
          query={params.toString()}
          clientName={clientName}
          redirectUri={parsed.value.redirectUri}
          state={parsed.value.state}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-[var(--fl-bg)] px-4 py-10 sm:py-16">
      {children}
    </main>
  );
}
