// Row shapes from Kickio's `kickbuy` read views (db/kickio/0001_*.sql).

type Identity = {
  product_id: string | null;
  team: string | null;
  team_id: string | null;
  season: string | null;
  shirt_type: string | null;
  manufacturer: string | null;
  gender: string | null;
  issue: string | null;
  special_edition: string | null;
  sleeves: string | null;
  signed: string | null;
  boxed_edition: string | null;
  player_name: string | null;
  shirt_number: string | null;
  size: string | null;
  condition: string | null;
  currency: string;
  price_cents: number;
  source_url: string | null;
};

export type InventoryRow = Identity & {
  listing_id: string;
  seller_id: string;
  title: string;
  status: string; // active | reserved | pending
  prep_status: string | null;
  source: string | null;
  source_name: string | null;
  is_partner_listing: boolean;
  raw_price_cents: number | null;
  image_url: string | null;
  description: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SaleRow = Identity & {
  sale_id: string;
  listing_id: string | null;
  sold_at: Date;
  source: string;
  sale_url: string | null;
  created_at: Date; // when Kickio recorded the sale
};

// Resolves a team name or alias (lower-cased) to Kickio's team id.
export type TeamLookup = (nameNorm: string) => string | null;

// Units of `currency` per 1 GBP on (or nearest before) `on`, or null when no
// rate is recorded.
export type FxLookup = (currency: string, on: Date) => number | null;

export type Settings = {
  minDiscountPct: number;
  maxSaleAgeMonths: number | null;
  requireExactSize: boolean;
  saleSources: string[] | null;
  // Which listings are valued at all; null = no restriction.
  listingSizes: string[] | null;
  worstCondition: string | null;
};
