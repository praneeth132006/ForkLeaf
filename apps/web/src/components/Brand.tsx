import React from "react";

/**
 * The ForkLeaf mark: a git fork whose branches terminate in leaves.
 *
 * Drawn with `currentColor` and no fills of its own so it inherits whatever
 * colour it is placed on — the footer, the dark hero and the light nav all use
 * the same component.
 */
export function ForkLeafMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* Trunk, rising from the root commit and splitting in two. */}
      <path d="M12 21v-5.5" />
      <path d="M12 15.5c0-2.6-2-3.4-3.4-4.3M12 15.5c0-2.6 2-3.4 3.4-4.3" />
      {/* Leaves at each branch tip. */}
      <path d="M8.6 11.2c-1.9-1.1-2.4-3.3-1.3-5.2 1.9 1.1 2.4 3.3 1.3 5.2Z" />
      <path d="M15.4 11.2c1.9-1.1 2.4-3.3 1.3-5.2-1.9 1.1-2.4 3.3-1.3 5.2Z" />
      {/* Root commit. */}
      <circle cx="12" cy="20" r="1.6" />
    </svg>
  );
}

/** Mark plus wordmark, as used in the nav, the sidebar and the footer. */
export function ForkLeafLogo({
  className = "",
  markClassName = "h-7 w-7",
  textClassName = "text-lg",
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-[var(--fl-accent)]">
        <ForkLeafMark className={markClassName} />
      </span>
      <span className={`font-semibold tracking-tight ${textClassName}`}>ForkLeaf</span>
    </span>
  );
}
