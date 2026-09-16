"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { mcpServerUrl } from "@/lib/mcp-url";

/**
 * Connecting an AI assistant, in one step per assistant.
 *
 * Every client gets the same address. The assistant opens ForkLeaf to sign in
 * the first time it is used, so there is no token to create and nothing to
 * install.
 */

export interface ConnectAssistantDialogProps {
  onClose: () => void;
}

export function CopyLine({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused; the text is selectable.
    }
  };
  return (
    <div className="mt-1.5 flex items-start gap-2">
      <pre
        aria-label={label}
        className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg bg-[var(--fl-inverse-bg)] px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--fl-inverse-text)]"
      >
        {text}
      </pre>
      <button type="button" onClick={() => void copy()} className="fl-btn fl-btn-ghost shrink-0">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function ConnectAssistantDialog({ onClose }: ConnectAssistantDialogProps) {
  const { url } = mcpServerUrl();

  return (
    <Dialog
      title="Connect an AI assistant"
      subtitle="Claude, Cursor, VS Code or any MCP client can search, read and write this notebook"
      onClose={onClose}
      wide
    >
      <div className="flex flex-col gap-5 text-[13.5px] text-[var(--fl-muted)]">
        <section>
          <h3 className="font-semibold text-[var(--fl-text)]">The address</h3>
          <p>Every assistant uses this. It opens ForkLeaf to sign in the first time.</p>
          <CopyLine text={url} label="MCP server address" />
        </section>

        <section>
          <h3 className="font-semibold text-[var(--fl-text)]">Claude Code</h3>
          <p>Run this once, then type /mcp in Claude Code and choose forkleaf → Authenticate.</p>
          <CopyLine
            text={`claude mcp add --transport http forkleaf ${url}`}
            label="Claude Code command"
          />
        </section>

        <section>
          <h3 className="font-semibold text-[var(--fl-text)]">Claude Desktop and claude.ai</h3>
          <p>
            Settings → Connectors → <strong>Add custom connector</strong>. Name it ForkLeaf, paste
            the address, press Add, then <strong>Connect</strong>.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-[var(--fl-text)]">Cursor</h3>
          <p>
            Add to <code>~/.cursor/mcp.json</code>, then press <strong>Connect</strong> beside
            forkleaf in Settings → MCP.
          </p>
          <CopyLine
            text={JSON.stringify({ mcpServers: { forkleaf: { url } } }, null, 2)}
            label="Cursor configuration"
          />
        </section>

        <section>
          <h3 className="font-semibold text-[var(--fl-text)]">VS Code</h3>
          <p>
            Add to <code>.vscode/mcp.json</code> and press <strong>Start</strong> above the server.
          </p>
          <CopyLine
            text={JSON.stringify({ servers: { forkleaf: { type: "http", url } } }, null, 2)}
            label="VS Code configuration"
          />
        </section>

        <p>
          When it asks, choose the repository it may use, and tick Read only if it should not write.
          Every change it makes is a commit.{" "}
          <Link href="/docs/mcp" className="text-[var(--fl-accent)] underline">
            Full guide
          </Link>
        </p>
      </div>
    </Dialog>
  );
}
