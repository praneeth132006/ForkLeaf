/**
 * Plan catalogue.
 *
 * Deliberately free of any Firebase or React import so that server components —
 * the pricing section on the landing page — can render it without pulling the
 * Firebase SDK into the bundle. Entitlement lookup lives in
 * `lib/firebase/billing.ts`; this file is only the menu.
 */

export type PlanId = "free" | "pro" | "team";

export interface Plan {
  id: PlanId;
  name: string;
  /** Price per month in the smallest currency unit. `0` for free. */
  amount: number;
  currency: string;
  tagline: string;
  features: string[];
  /** Marked as the default recommendation in the pricing table. */
  highlighted?: boolean;
}

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    amount: 0,
    currency: "USD",
    tagline: "Everything you need to write, forever.",
    features: [
      "Unlimited notes in your own repo",
      "Rich, split and source editing",
      "Mermaid diagram studio",
      "Markdown, HTML, Word and PDF export",
      "Offline-first with background sync",
      "One connected repository",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    amount: 600,
    currency: "USD",
    tagline: "For people who live in their notes.",
    highlighted: true,
    features: [
      "Everything in Free",
      "Unlimited connected repositories",
      "Full-text search across every repo",
      "Custom export themes",
      "Priority conflict assistance",
    ],
  },
  {
    id: "team",
    name: "Team",
    amount: 1200,
    currency: "USD",
    tagline: "Shared docs, still inside your own GitHub org.",
    features: [
      "Everything in Pro",
      "Org-wide repository connections",
      "Shared diagram template library",
      "Per-seat billing and admin",
      "Audit log of every sync",
    ],
  },
];

export function formatPrice(plan: Plan): string {
  if (plan.amount === 0) return "Free";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: plan.currency,
    minimumFractionDigits: plan.amount % 100 === 0 ? 0 : 2,
  }).format(plan.amount / 100);
}
