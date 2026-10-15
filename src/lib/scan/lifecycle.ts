// Opportunity lifecycle: what a scan does to an opportunity, given the
// latest evaluation of its listing. Pure, so the rules are easy to test.
//
//   new        newly detected
//   watching   a person is following it up
//   dismissed  a person reviewed and rejected it
//   expired    the listing is gone or no longer qualifies
//
// Alerts fire once per listing and qualifying price; a further price drop
// alerts again.

import type { Evaluation } from "../engine/evaluate";

export type OpportunityStatus = "new" | "watching" | "dismissed" | "expired";

export type ExistingOpportunity = {
  status: OpportunityStatus;
  dismissed_ask_pence: number | null;
};

export type LifecycleDecision = {
  write: boolean; // upsert the opportunity row
  status: OpportunityStatus;
  qualifies: boolean;
  expiredReason: string | null;
  alert: "new" | "price_drop" | null;
};

export function decide(
  existing: ExistingOpportunity | null,
  evaluation: Evaluation | null, // null: listing no longer in inventory
  lowestAlertedAsk: number | null,
  alertsEnabled: boolean,
): LifecycleDecision {
  const priced = evaluation?.kind === "priced" ? evaluation : null;

  if (!priced || !priced.qualifies) {
    if (!existing || existing.status === "expired") {
      return { write: false, status: existing?.status ?? "new", qualifies: false, expiredReason: null, alert: null };
    }
    const reason =
      evaluation === null
        ? "Listing is no longer available"
        : priced
          ? `No longer qualifies: ${priced.discountPct}% below the last sale`
          : evaluation.kind === "unmatchable"
            ? `Can no longer be matched: ${evaluation.reasons.join("; ")}`
            : "No valid comparable sale any more";
    return { write: true, status: "expired", qualifies: false, expiredReason: reason, alert: null };
  }

  const ask = priced.askPence;
  const firstAlert = lowestAlertedAsk === null;
  const furtherDrop = lowestAlertedAsk !== null && ask < lowestAlertedAsk;
  const alert = !alertsEnabled ? null : firstAlert ? "new" : furtherDrop ? "price_drop" : null;

  let status: OpportunityStatus;
  if (!existing || existing.status === "expired") status = "new";
  else if (existing.status === "dismissed")
    // Reopen a dismissed opportunity only if the price has dropped below
    // what it was when someone dismissed it.
    status = existing.dismissed_ask_pence !== null && ask < existing.dismissed_ask_pence ? "new" : "dismissed";
  else status = existing.status;

  return { write: true, status, qualifies: true, expiredReason: null, alert };
}
