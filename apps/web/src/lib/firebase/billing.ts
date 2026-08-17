"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import type { PlanId } from "@/lib/plans";
import { ensureFirebaseUser, firestore } from "./client";

/**
 * Entitlement.
 *
 * No payment provider is wired up yet — this is the shape the rest of the app
 * codes against, so adding Stripe or Razorpay later is a checkout route plus a
 * webhook rather than a refactor. The plan catalogue itself lives in
 * `lib/plans.ts`.
 *
 * The browser only ever *reads* entitlement.
 * `users/{uid}/billing/subscription` is written exclusively by a server-side
 * webhook and is read-only in `firestore.rules`; a client that could write its
 * own plan would make the paywall decorative.
 */

export type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

export interface Subscription {
  plan: PlanId;
  status: SubscriptionStatus;
  /** Provider slug once one is connected: "stripe", "razorpay", … */
  provider: string | null;
  /** ISO 8601. Null on the free plan. */
  currentPeriodEnd: string | null;
}

export const FREE_SUBSCRIPTION: Subscription = {
  plan: "free",
  status: "none",
  provider: null,
  currentPeriodEnd: null,
};

export interface PlanState {
  subscription: Subscription;
  /** True until the first snapshot arrives, or until we give up on getting one. */
  loading: boolean;
}

/**
 * Subscribes to the current user's entitlement.
 *
 * Falls back to the free plan whenever Firebase is unconfigured, the user has
 * no billing document, or the read fails — so an outage degrades to "everyone
 * is on Free" rather than locking people out of their own notes.
 */
export function usePlan(): PlanState {
  const [state, setState] = useState<PlanState>({
    subscription: FREE_SUBSCRIPTION,
    loading: true,
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const db = firestore();
      const user = await ensureFirebaseUser();

      if (cancelled) return;
      if (!db || !user) {
        setState({ subscription: FREE_SUBSCRIPTION, loading: false });
        return;
      }

      unsubscribe = onSnapshot(
        doc(db, "users", user.uid, "billing", "subscription"),
        (snapshot) => {
          setState({
            subscription: snapshot.exists()
              ? { ...FREE_SUBSCRIPTION, ...(snapshot.data() as Partial<Subscription>) }
              : FREE_SUBSCRIPTION,
            loading: false,
          });
        },
        (error) => {
          console.warn("[ForkLeaf] Could not read subscription:", error);
          setState({ subscription: FREE_SUBSCRIPTION, loading: false });
        },
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return state;
}

/** True when the subscription entitles the user to paid features right now. */
export function isPaid(subscription: Subscription): boolean {
  return subscription.plan !== "free" && ["active", "trialing"].includes(subscription.status);
}
