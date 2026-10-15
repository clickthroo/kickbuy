// Valuation: for one listing, find its comparable sales, pick the reference
// sale, and work out the discount.
//
// The reference is always one real sale: the most recent valid sale of the
// same shirt in the same condition. Median and recent sales are shown for
// context only and never replace it. Money is in pence (integers).

import { bucketKey, type Confidence, CONFIDENCE_RANK, isSelfSale, matchShirts, type Shirt, toShirt, unmatchableReasons } from "./match";
import type { FxLookup, InventoryRow, SaleRow, Settings, TeamLookup } from "./types";

export type Comparable = {
  saleId: string;
  soldAt: Date;
  source: string;
  url: string | null;
  size: string | null;
  originalPence: number;
  currency: string;
  fxRate: number | null; // units of `currency` per 1 GBP, when converted
  pence: number; // in the listing's currency
  confidence: Confidence;
  basis: "product" | "attributes";
  sizeExact: boolean;
  stale: boolean;
  notes: string[];
};

export type Evaluation =
  | { kind: "unmatchable"; reasons: string[] }
  | { kind: "insufficient_data"; reasons: string[] }
  | {
      kind: "priced";
      reference: Comparable;
      askPence: number;
      discountPct: number; // (ref - ask) / ref × 100, 2 dp; negative when above
      savingPence: number;
      qualifies: boolean;
      confidence: Confidence;
      needsReview: boolean;
      notes: string[];
      recent: Comparable[]; // up to three most recent comparables, newest first
      medianPence: number | null; // of `recent`
      comparableCount: number;
    };

type IndexedSale = { row: SaleRow; shirt: Shirt };

export class SalesIndex {
  private byProduct = new Map<string, IndexedSale[]>();
  private byBucket = new Map<string, IndexedSale[]>();
  readonly size: number;

  constructor(
    sales: SaleRow[],
    readonly teams: TeamLookup,
  ) {
    for (const row of sales) {
      const entry = { row, shirt: toShirt(row, teams) };
      if (row.product_id) push(this.byProduct, row.product_id, entry);
      const key = bucketKey(entry.shirt);
      if (key) push(this.byBucket, key, entry);
    }
    this.size = sales.length;
  }

  candidates(listing: Shirt): IndexedSale[] {
    const seen = new Set<string>();
    const out: IndexedSale[] = [];
    const add = (list: IndexedSale[] | undefined) => {
      for (const s of list ?? []) {
        if (!seen.has(s.row.sale_id)) {
          seen.add(s.row.sale_id);
          out.push(s);
        }
      }
    };
    if (listing.productId) add(this.byProduct.get(listing.productId));
    const key = bucketKey(listing);
    if (key) add(this.byBucket.get(key));
    return out;
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function monthsBefore(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

// Converts a sale price into the listing's currency at the sale date.
function convert(
  pence: number,
  from: string,
  to: string,
  on: Date,
  fx: FxLookup,
): { pence: number; rate: number | null } | null {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return { pence, rate: null };
  const fromRate = a === "GBP" ? 1 : fx(a, on);
  const toRate = b === "GBP" ? 1 : fx(b, on);
  if (!fromRate || !toRate) return null;
  return { pence: Math.round((pence / fromRate) * toRate), rate: a === "GBP" ? toRate : fromRate };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function discountPct(askPence: number, refPence: number): number {
  return Math.round(((refPence - askPence) / refPence) * 10000) / 100;
}

// Best match first: more confident, then same size, then most recent.
function better(a: Comparable, b: Comparable): number {
  return (
    CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
    Number(b.sizeExact) - Number(a.sizeExact) ||
    b.soldAt.getTime() - a.soldAt.getTime()
  );
}

export function evaluateListing(
  listing: InventoryRow,
  index: SalesIndex,
  settings: Settings,
  fx: FxLookup,
  asOf: Date = new Date(),
): Evaluation {
  const shirt = toShirt(listing, index.teams);
  const reasons = unmatchableReasons(shirt, listing.condition);
  if (!(listing.price_cents > 0)) reasons.push("No asking price");
  if (reasons.length > 0) return { kind: "unmatchable", reasons };

  const cutoff = settings.maxSaleAgeMonths ? monthsBefore(asOf, settings.maxSaleAgeMonths) : null;
  const sources = settings.saleSources ? new Set(settings.saleSources) : null;
  const rejected = new Map<string, number>();
  const comparables: Comparable[] = [];

  for (const { row, shirt: saleShirt } of index.candidates(shirt)) {
    if (sources && !sources.has(row.source)) continue;
    if (row.sold_at.getTime() > asOf.getTime()) continue;
    if (isSelfSale(listing.listing_id, shirt, row, saleShirt)) continue;
    const m = matchShirts(shirt, saleShirt, { requireExactSize: settings.requireExactSize });
    if (!m.ok) {
      rejected.set(m.reason, (rejected.get(m.reason) ?? 0) + 1);
      continue;
    }
    const converted = convert(row.price_cents, row.currency, listing.currency, row.sold_at, fx);
    if (!converted) {
      rejected.set(`no ${row.currency} exchange rate`, (rejected.get(`no ${row.currency} exchange rate`) ?? 0) + 1);
      continue;
    }
    comparables.push({
      saleId: row.sale_id,
      soldAt: row.sold_at,
      source: row.source,
      url: row.sale_url,
      size: row.size,
      originalPence: row.price_cents,
      currency: row.currency.toUpperCase(),
      fxRate: converted.rate,
      pence: converted.pence,
      confidence: m.confidence,
      basis: m.basis,
      sizeExact: m.sizeExact,
      stale: cutoff !== null && row.sold_at.getTime() < cutoff.getTime(),
      notes: m.notes,
    });
  }

  if (comparables.length === 0) {
    const why = [...rejected.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      kind: "insufficient_data",
      reasons: why.length
        ? why.map(([r, n]) => `${n} sale${n === 1 ? "" : "s"} of this shirt ruled out: ${r}`)
        : ["No sales of this shirt in this condition"],
    };
  }

  // Sales older than the age limit are only used when there is nothing
  // fresher, and then they're marked stale.
  const fresh = comparables.filter((c) => !c.stale);
  const pool = (fresh.length > 0 ? fresh : comparables).sort(better);
  const reference = pool[0];

  const recent = [...pool].sort((a, b) => b.soldAt.getTime() - a.soldAt.getTime()).slice(0, 3);
  const askPence = listing.price_cents;
  const pct = discountPct(askPence, reference.pence);
  const notes = [...reference.notes];
  if (reference.stale) notes.push(`last sale is older than ${settings.maxSaleAgeMonths} months`);
  if (reference.fxRate !== null) notes.push(`converted from ${reference.currency}`);

  return {
    kind: "priced",
    reference,
    askPence,
    discountPct: pct,
    savingPence: reference.pence - askPence,
    qualifies: pct >= settings.minDiscountPct,
    confidence: reference.confidence,
    needsReview: reference.confidence === "low" || reference.stale,
    notes,
    recent,
    medianPence: median(recent.map((c) => c.pence)),
    comparableCount: pool.length,
  };
}
