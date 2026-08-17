import React from "react";

const STEPS = [
  {
    n: "01",
    title: "Connect a repository",
    body: "Sign in with GitHub and ForkLeaf creates a private forkleaf-notes repo, or point it at one you already have. Public or private, any branch.",
  },
  {
    n: "02",
    title: "Write",
    body: "Rich text, split view, or raw Markdown — the same document, three ways to hold it. Type / for commands, and draw Mermaid diagrams without memorising the syntax.",
  },
  {
    n: "03",
    title: "It commits itself",
    body: "Edits save to your device instantly and drain to GitHub in atomic commits. Close the laptop mid-sentence, fly somewhere, keep writing — it catches up when you land.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="How it works"
        title="Three steps, then never think about it again"
      />

      <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-border)] md:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="bg-[var(--fl-bg)] p-7">
            <span className="font-mono text-xs font-semibold tracking-widest text-[var(--fl-accent)]">
              {step.n}
            </span>
            <h3 className="mt-4 text-lg font-semibold tracking-tight text-[var(--fl-text)]">
              {step.title}
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--fl-muted)]">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.025em] text-[var(--fl-text)] sm:text-[2.5rem]">
        {title}
      </h2>
      {body && <p className="mt-4 text-[17px] leading-relaxed text-[var(--fl-muted)]">{body}</p>}
    </div>
  );
}
