/**
 * The heading every landing section below the fold shares.
 *
 * Lived in HowItWorks until the scroll story replaced it; it was always a
 * shared piece rather than part of that section, so it now sits on its own.
 */
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
