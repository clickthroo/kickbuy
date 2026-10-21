import { describe, expect, it } from "vitest";
import { discountPct, evaluateListing, median, SalesIndex } from "./evaluate";
import { listing, sale } from "./fixtures";
import type { FxLookup, SaleRow, Settings } from "./types";

const asOf = new Date("2026-10-15T12:00:00Z");
const settings: Settings = { minDiscountPct: 20, maxSaleAgeMonths: 12, requireExactSize: false, saleSources: null, listingSizes: null, worstCondition: null, excludedListingSources: [] };
const noTeams = () => null;
const noFx: FxLookup = () => null;

function evaluate(sales: SaleRow[], l = listing(), s: Partial<Settings> = {}, fx = noFx) {
  return evaluateListing(l, new SalesIndex(sales, noTeams), { ...settings, ...s }, fx, asOf);
}

function priced(r: ReturnType<typeof evaluate>) {
  if (r.kind !== "priced") throw new Error(`expected priced, got ${r.kind}: ${JSON.stringify(r)}`);
  return r;
}

describe("discount", () => {
  it("matches the spec example: £80 vs £120 is 33.33% off, £40 saving", () => {
    expect(discountPct(8000, 12000)).toBe(33.33);
    const r = priced(evaluate([sale()]));
    expect(r.discountPct).toBe(33.33);
    expect(r.savingPence).toBe(4000);
    expect(r.qualifies).toBe(true);
  });

  it("qualifies at exactly the threshold, not below", () => {
    expect(priced(evaluate([sale({ price_cents: 10000 })]))).toMatchObject({ discountPct: 20, qualifies: true });
    expect(priced(evaluate([sale({ price_cents: 9999 })])).qualifies).toBe(false);
  });

  it("reports a negative discount when the listing is above the last sale", () => {
    expect(priced(evaluate([sale({ price_cents: 6000 })])).discountPct).toBeLessThan(0);
  });
});

describe("reference sale", () => {
  it("uses the lowest sale within the period, not the most recent, median or best size", () => {
    // The screenshot case: £250.99 (same size) and £98.99 in August, £91.50 in October.
    const r = priced(
      evaluate([
        sale({ sale_id: "vfs-l", size: "L", price_cents: 25099, sold_at: new Date("2026-08-21") }),
        sale({ sale_id: "vfs-xl", size: "XL", price_cents: 9899, sold_at: new Date("2026-08-20") }),
        sale({ sale_id: "kc-m", size: "M", price_cents: 9150, sold_at: new Date("2026-10-10") }),
        sale({ sale_id: "old", size: "L", price_cents: 5000, sold_at: new Date("2025-01-01") }),
      ]),
    );
    expect(r.reference.saleId).toBe("kc-m");
    expect(r.reference.stale).toBe(false);
    expect(r.recent.map((c) => c.saleId)).toEqual(["kc-m", "vfs-l", "vfs-xl"]);
    expect(r.medianPence).toBe(9899);
  });

  it("shows the reference with the recent sales even when it's older than the last three", () => {
    const r = priced(
      evaluate([
        sale({ sale_id: "cheap", price_cents: 6000, sold_at: new Date("2026-02-01") }),
        sale({ sale_id: "a", price_cents: 9000, sold_at: new Date("2026-10-01") }),
        sale({ sale_id: "b", price_cents: 9500, sold_at: new Date("2026-09-01") }),
        sale({ sale_id: "c", price_cents: 9900, sold_at: new Date("2026-08-01") }),
      ]),
    );
    expect(r.reference.saleId).toBe("cheap");
    expect(r.recent.map((c) => c.saleId)).toEqual(["a", "b", "c", "cheap"]);
    expect(r.medianPence).toBe(9500);
    expect(r.discountPct).toBe(-33.33);
  });

  it("never values against a sale in a different condition", () => {
    const r = evaluate([sale({ condition: "Mint" })]);
    expect(r.kind).toBe("insufficient_data");
  });

  it("says insufficient data when there are no sales", () => {
    expect(evaluate([])).toEqual({ kind: "insufficient_data", reasons: ["No sales of this shirt in this condition"] });
  });

  it("ignores the listing's own earlier sale", () => {
    const own = sale({ listing_id: listing().listing_id });
    expect(evaluate([own]).kind).toBe("insufficient_data");
    const sameUrl = sale({ source_url: "https://www.thekitman.co.uk/product/x/" });
    expect(evaluate([sameUrl], listing({ source_url: "https://thekitman.co.uk/product/x" })).kind).toBe(
      "insufficient_data",
    );
  });

  it("ignores sales from sources that aren't enabled", () => {
    expect(evaluate([sale({ source: "cfs" })], listing(), { saleSources: ["kickio"] }).kind).toBe("insufficient_data");
  });

  it("prefers a fresh sale and marks an old one stale when nothing fresher exists", () => {
    const old = sale({ sale_id: "old", sold_at: new Date("2025-01-01") });
    const r = priced(evaluate([old]));
    expect(r.reference.stale).toBe(true);
    expect(r.needsReview).toBe(true);
    const r2 = priced(evaluate([old, sale({ sale_id: "new", sold_at: new Date("2026-02-01"), price_cents: 9000 })]));
    expect(r2.reference.saleId).toBe("new");
    expect(r2.reference.stale).toBe(false);
  });

  it("converts a foreign-currency sale at the recorded rate", () => {
    const fx: FxLookup = (c) => (c === "EUR" ? 1.2 : null);
    const r = priced(evaluate([sale({ currency: "EUR", price_cents: 14400 })], listing(), {}, fx));
    expect(r.reference.pence).toBe(12000);
    expect(r.reference.fxRate).toBe(1.2);
    expect(r.notes).toContain("converted from EUR");
  });

  it("skips a foreign-currency sale with no recorded rate", () => {
    expect(evaluate([sale({ currency: "USD" })]).kind).toBe("insufficient_data");
  });
});

describe("matching", () => {
  it("rates a same-product, same-size match high", () => {
    const pid = "11111111-1111-1111-1111-111111111111";
    const r = priced(evaluate([sale({ product_id: pid })], listing({ product_id: pid })));
    expect(r.confidence).toBe("high");
    expect(r.reference.basis).toBe("product");
  });

  it("rates an attribute match with everything known medium", () => {
    expect(priced(evaluate([sale()])).confidence).toBe("medium");
  });

  it("drops to low and flags for review when an attribute is missing", () => {
    const r = priced(evaluate([sale({ manufacturer: null })]));
    expect(r.confidence).toBe("low");
    expect(r.needsReview).toBe(true);
    expect(r.notes).toContain("manufacturer missing on the sale");
  });

  it("requires club, season, type, player and number to match", () => {
    for (const o of [
      { team: "Arsenal" },
      { season: "1998-99" },
      { shirt_type: "Away" },
      { player_name: "Beckham" },
      { shirt_number: "7" },
      { issue: "Authentic/Player Version" },
      { signed: "Signed" },
      { manufacturer: "Nike" },
      { sleeves: "Long-Sleeved" },
    ]) {
      expect(evaluate([sale(o)]).kind, JSON.stringify(o)).toBe("insufficient_data");
    }
  });

  it("matches team aliases and season spellings", () => {
    const teams = (n: string) => (n === "man utd" || n === "manchester united" ? "team-1" : null);
    const r = evaluateListing(
      listing({ team: "Man Utd", season: "97/98" }),
      new SalesIndex([sale()], teams),
      settings,
      noFx,
      asOf,
    );
    expect(r.kind).toBe("priced");
  });

  it("never compares kids' and adult sizes", () => {
    expect(evaluate([sale({ size: "13-14 Years" })]).kind).toBe("insufficient_data");
  });

  it("prefers the same size, and can require it", () => {
    const r = priced(
      evaluate([
        sale({ sale_id: "m", size: "M", sold_at: new Date("2026-10-01") }),
        sale({ sale_id: "l", size: "Large", sold_at: new Date("2026-08-01") }),
      ]),
    );
    expect(r.reference.saleId).toBe("l");
    const onlyM = priced(evaluate([sale({ size: "M" })]));
    expect(onlyM.reference.sizeExact).toBe(false);
    expect(onlyM.notes).toContain("size M vs L");
    expect(evaluate([sale({ size: "M" })], listing(), { requireExactSize: true }).kind).toBe("insufficient_data");
  });

  it("can't value a listing with an unreadable condition or missing identity", () => {
    expect(evaluate([sale()], listing({ condition: "Excelllent" }))).toEqual({
      kind: "unmatchable",
      reasons: ['Condition "Excelllent" is not a Kickio grade'],
    });
    expect(evaluate([sale()], listing({ season: null })).kind).toBe("unmatchable");
  });
});

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });
});
