// The product matching engine: decides whether a sale is evidence for the
// value of a listing, and how sure we are.
//
// Deterministic only. Matching uses Kickio's product identity first (the same
// shirt in Kickio's catalogue), then its structured attributes; never titles
// or descriptions. Condition must always be the same grade.

import {
  canonicalCondition,
  type Condition,
  norm,
  normaliseManufacturer,
  normaliseNumber,
  normalisePlayer,
  normaliseSeason,
  normaliseSize,
  type NormalisedSize,
  normaliseUrl,
} from "./normalise";
import type { InventoryRow, SaleRow, TeamLookup } from "./types";

export type Confidence = "high" | "medium" | "low";
export const CONFIDENCE_RANK: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

// Normalised identity of a listing or sale.
export type Shirt = {
  productId: string | null;
  teamKey: string | null;
  season: string | null;
  shirtType: string | null;
  condition: Condition | null;
  size: NormalisedSize;
  manufacturer: string | null;
  gender: string | null;
  issue: string | null;
  sleeves: string | null;
  // Kickio treats a missing value as the default ("Not Signed", "Not A
  // Special Edition", ...), so these never count as unknown.
  signed: string;
  specialEdition: string;
  boxedEdition: string;
  // A missing name/number means "no name set", so they must match exactly.
  player: string | null;
  number: string | null;
  sourceUrl: string | null;
};

const notApplicable = (v: string | null) => (v === null || v === "not applicable" ? null : v);

export function toShirt(row: InventoryRow | SaleRow, teams: TeamLookup): Shirt {
  const teamName = norm(row.team);
  const teamId = row.team_id ?? (teamName ? teams(teamName) : null);
  return {
    productId: row.product_id,
    teamKey: teamId ? `id:${teamId}` : teamName ? `name:${teamName}` : null,
    season: normaliseSeason(row.season),
    shirtType: norm(row.shirt_type),
    condition: canonicalCondition(row.condition),
    size: normaliseSize(row.size),
    manufacturer: normaliseManufacturer(row.manufacturer),
    gender: norm(row.gender),
    issue: norm(row.issue),
    sleeves: notApplicable(norm(row.sleeves)),
    signed: norm(row.signed) ?? "not signed",
    specialEdition: norm(row.special_edition) ?? "not a special edition",
    boxedEdition: norm(row.boxed_edition) ?? "not a boxed edition",
    player: normalisePlayer(row.player_name),
    number: normaliseNumber(row.shirt_number),
    sourceUrl: normaliseUrl(row.source_url),
  };
}

// Index key for candidate lookup: sales can only match listings that share it.
export function bucketKey(s: Shirt): string | null {
  if (!s.teamKey || !s.season || !s.shirtType) return null;
  return `${s.teamKey}|${s.season}|${s.shirtType}`;
}

// Why a listing can't be valued at all.
export function unmatchableReasons(s: Shirt, rawCondition: string | null): string[] {
  const reasons: string[] = [];
  if (!s.condition) {
    reasons.push(rawCondition ? `Condition "${rawCondition}" is not a Kickio grade` : "No condition");
  }
  if (!s.productId) {
    if (!s.teamKey) reasons.push("No club / country");
    if (!s.season) reasons.push("No season");
    if (!s.shirtType) reasons.push("No shirt type (home / away / third)");
  }
  return reasons;
}

export type MatchResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      confidence: Confidence;
      basis: "product" | "attributes";
      sizeExact: boolean;
      notes: string[];
    };

// Soft attributes: when both sides know them they must agree; when one side
// doesn't, we can't rule out a different shirt, so the match is kept but
// flagged for a person to check.
const SOFT: { key: "manufacturer" | "gender" | "issue" | "sleeves"; label: string }[] = [
  { key: "manufacturer", label: "manufacturer" },
  { key: "gender", label: "gender / fit" },
  { key: "issue", label: "version (replica / authentic / match-worn)" },
  { key: "sleeves", label: "sleeve length" },
];

export function matchShirts(listing: Shirt, sale: Shirt, opts: { requireExactSize: boolean }): MatchResult {
  // Condition is mandatory and must be the same grade.
  if (!listing.condition || !sale.condition) return { ok: false, reason: "condition unknown" };
  if (listing.condition !== sale.condition) return { ok: false, reason: "different condition" };

  const sameProduct = listing.productId !== null && listing.productId === sale.productId;
  const notes: string[] = [];

  if (!sameProduct) {
    // Required attributes: both known and equal.
    if (!listing.teamKey || listing.teamKey !== sale.teamKey) return { ok: false, reason: "different club" };
    if (!listing.season || listing.season !== sale.season) return { ok: false, reason: "different season" };
    if (!listing.shirtType || listing.shirtType !== sale.shirtType) return { ok: false, reason: "different shirt type" };
    if (listing.player !== sale.player) return { ok: false, reason: "different player / name set" };
    if (listing.number !== sale.number) return { ok: false, reason: "different number" };
  }
  if (listing.signed !== sale.signed) return { ok: false, reason: "signed vs not signed" };
  if (listing.specialEdition !== sale.specialEdition) return { ok: false, reason: "different special edition" };
  if (listing.boxedEdition !== sale.boxedEdition) return { ok: false, reason: "different boxed edition" };

  let assumed = 0;
  for (const { key, label } of SOFT) {
    const a = listing[key];
    const b = sale[key];
    if (a !== null && b !== null) {
      if (a !== b) return { ok: false, reason: `different ${label}` };
    } else if (!(sameProduct && key !== "manufacturer")) {
      // Same product guarantees everything in Kickio's product identity, which
      // doesn't include manufacturer.
      assumed += 1;
      notes.push(`${label} missing on the ${a === null && b === null ? "listing and sale" : a === null ? "listing" : "sale"}`);
    }
  }

  // Size: a kids' shirt is never compared with an adult one.
  const ls = listing.size;
  const ss = sale.size;
  if (ls.band && ss.band && ls.band !== ss.band) return { ok: false, reason: "adult vs kids size" };
  const sizeExact = ls.key !== null && ls.key === ss.key;
  if (opts.requireExactSize && !sizeExact) return { ok: false, reason: "size differs" };

  let confidence: Confidence = sameProduct ? "high" : "medium";
  if (assumed > 0) confidence = "low";
  if (!sizeExact) {
    notes.push(ls.key && ss.key ? `size ${ss.key} vs ${ls.key}` : "size not comparable");
    if (confidence === "high") confidence = "medium";
  }
  return { ok: true, confidence, basis: sameProduct ? "product" : "attributes", sizeExact, notes };
}

// A listing must never be valued against its own sale (a relisted item, or a
// scraped item that was recorded as sold and then reappeared).
export function isSelfSale(listingId: string, listing: Shirt, sale: SaleRow, saleShirt: Shirt): boolean {
  if (sale.listing_id !== null && sale.listing_id === listingId) return true;
  return listing.sourceUrl !== null && listing.sourceUrl === saleShirt.sourceUrl;
}
