import { describe, expect, it } from "vitest";
import type { Evaluation } from "../engine/evaluate";
import { decide } from "./lifecycle";

function priced(askPence: number, qualifies = true): Evaluation {
  return {
    kind: "priced",
    askPence,
    qualifies,
    discountPct: qualifies ? 30 : 5,
    savingPence: 1000,
    confidence: "high",
    needsReview: false,
    notes: [],
    recent: [],
    medianPence: null,
    comparableCount: 1,
    reference: {} as never,
  };
}

describe("decide", () => {
  it("creates a new opportunity and alerts once", () => {
    expect(decide(null, priced(8000), null, true)).toMatchObject({ write: true, status: "new", alert: "new" });
    expect(decide({ status: "new", dismissed_ask_pence: null }, priced(8000), 8000, true).alert).toBeNull();
  });

  it("alerts again only when the price drops further", () => {
    expect(decide({ status: "watching", dismissed_ask_pence: null }, priced(7000), 8000, true)).toMatchObject({
      status: "watching",
      alert: "price_drop",
    });
    expect(decide({ status: "watching", dismissed_ask_pence: null }, priced(8500), 8000, true).alert).toBeNull();
  });

  it("doesn't alert when alerts are off", () => {
    expect(decide(null, priced(8000), null, false).alert).toBeNull();
  });

  it("keeps a dismissal unless the price drops below the dismissed price", () => {
    const dismissed = { status: "dismissed" as const, dismissed_ask_pence: 8000 };
    expect(decide(dismissed, priced(8000), 8000, true).status).toBe("dismissed");
    expect(decide(dismissed, priced(7500), 8000, true)).toMatchObject({ status: "new", alert: "price_drop" });
  });

  it("expires when the listing is gone or no longer qualifies, and reopens if it qualifies again", () => {
    const open = { status: "new" as const, dismissed_ask_pence: null };
    expect(decide(open, null, 8000, true)).toMatchObject({
      status: "expired",
      expiredReason: "Listing is no longer available",
    });
    expect(decide(open, priced(9900, false), 8000, true).expiredReason).toBe("No longer qualifies: 5% below the last sale");
    expect(decide(open, { kind: "insufficient_data", reasons: [] }, 8000, true).status).toBe("expired");
    expect(decide({ status: "expired", dismissed_ask_pence: null }, priced(8000), 8000, true)).toMatchObject({
      status: "new",
      alert: null,
    });
  });

  it("does nothing for a listing that never qualified", () => {
    expect(decide(null, priced(9900, false), null, true).write).toBe(false);
    expect(decide(null, null, null, true).write).toBe(false);
  });
});

describe("decide on already-expired opportunities", () => {
  it("leaves them alone while they still don't qualify", () => {
    const expired = { status: "expired" as const, dismissed_ask_pence: null };
    expect(decide(expired, null, 8000, true).write).toBe(false);
    expect(decide(expired, priced(9900, false), 8000, true).write).toBe(false);
  });
});
