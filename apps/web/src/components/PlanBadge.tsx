"use client";

import React from "react";
import { usePlan, isPaid } from "@/lib/firebase/billing";
import { PLANS } from "@/lib/plans";

/**
 * The current plan, as a small chip.
 *
 * Renders nothing while the entitlement is still loading rather than flashing
 * "Free" at a paying customer for a frame.
 */
export function PlanBadge({ className = "" }: { className?: string }) {
  const { subscription, loading } = usePlan();
  if (loading) return null;

  const plan = PLANS.find((item) => item.id === subscription.plan) ?? PLANS[0]!;
  const paid = isPaid(subscription);

  return (
    <span
      title={paid ? `You are on ${plan.name}` : "You are on the Free plan"}
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        paid
          ? "bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]"
          : "bg-[var(--fl-elevated)] text-[var(--fl-muted)]"
      } ${className}`}
    >
      {plan.name}
    </span>
  );
}
