// Dashboard filters, read from and written to the URL.

import { CONDITIONS } from "./engine/normalise";

export const SORTS = {
  discount: "Biggest % discount",
  saving: "Biggest saving",
  newest: "Newest listing",
  confidence: "Highest match confidence",
} as const;
export type Sort = keyof typeof SORTS;

export const STATUS_FILTERS = {
  open: "Open (new + watching)",
  new: "New",
  watching: "Watching",
  dismissed: "Dismissed",
  expired: "Expired",
  all: "All",
} as const;
export type StatusFilter = keyof typeof STATUS_FILTERS;

export const LISTING_FILTERS = {
  all: "Live and pre-live",
  prelive: "Pre-live (review queue)",
  live: "Live on Kickio",
} as const;
export type ListingFilter = keyof typeof LISTING_FILTERS;

export type Filters = {
  status: StatusFilter;
  listing: ListingFilter;
  q: string;
  club: string;
  season: string;
  condition: string;
  minPrice: number | null; // pounds
  maxPrice: number | null;
  minDiscount: number | null; // %
  confidence: "" | "high" | "medium" | "low";
  listedSince: string; // yyyy-mm-dd
  refSource: string;
  sort: Sort;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

function num(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function pick<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function parseFilters(params: Params): Filters {
  const listedSince = one(params.since);
  return {
    status: pick(one(params.status), Object.keys(STATUS_FILTERS) as StatusFilter[], "open"),
    listing: pick(one(params.listing), Object.keys(LISTING_FILTERS) as ListingFilter[], "all"),
    q: one(params.q).slice(0, 100),
    club: one(params.club).slice(0, 100),
    season: one(params.season).slice(0, 20),
    condition: pick(one(params.condition), ["", ...CONDITIONS], ""),
    minPrice: num(one(params.min)),
    maxPrice: num(one(params.max)),
    minDiscount: num(one(params.disc)),
    confidence: pick(one(params.conf), ["", "high", "medium", "low"] as const, ""),
    listedSince: /^\d{4}-\d{2}-\d{2}$/.test(listedSince) ? listedSince : "",
    refSource: one(params.src).slice(0, 40),
    sort: pick(one(params.sort), Object.keys(SORTS) as Sort[], "discount"),
    page: Math.max(1, Math.floor(num(one(params.page)) ?? 1)),
  };
}

export function filtersToQuery(f: Filters, overrides: Partial<Filters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (v.status !== "open") p.set("status", v.status);
  if (v.listing !== "all") p.set("listing", v.listing);
  if (v.q) p.set("q", v.q);
  if (v.club) p.set("club", v.club);
  if (v.season) p.set("season", v.season);
  if (v.condition) p.set("condition", v.condition);
  if (v.minPrice !== null) p.set("min", String(v.minPrice));
  if (v.maxPrice !== null) p.set("max", String(v.maxPrice));
  if (v.minDiscount !== null) p.set("disc", String(v.minDiscount));
  if (v.confidence) p.set("conf", v.confidence);
  if (v.listedSince) p.set("since", v.listedSince);
  if (v.refSource) p.set("src", v.refSource);
  if (v.sort !== "discount") p.set("sort", v.sort);
  if (v.page > 1) p.set("page", String(v.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function hasFilters(f: Filters): boolean {
  return filtersToQuery(f, { sort: "discount", page: 1 }) !== "";
}
