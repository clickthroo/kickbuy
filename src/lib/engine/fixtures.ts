// Test fixtures shared by the engine and scanner tests.
import type { InventoryRow, SaleRow } from "./types";

const base = {
  product_id: null,
  team: "Manchester United",
  team_id: null,
  season: "1997-98",
  shirt_type: "Home",
  manufacturer: "Umbro",
  gender: "Mens",
  issue: "Standard Retail Version",
  special_edition: "Not A Special Edition",
  sleeves: "Short-Sleeved",
  signed: "Not Signed",
  boxed_edition: null,
  player_name: null,
  shirt_number: null,
  size: "L",
  condition: "Very Good",
  currency: "GBP",
  source_url: null,
};

export function listing(overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    ...base,
    listing_id: "00000000-0000-0000-0000-00000000000a",
    seller_id: "00000000-0000-0000-0000-0000000000b0",
    title: "1997-98 Manchester United Home Shirt",
    status: "pending",
    prep_status: null,
    source: "scrape",
    source_name: "The Kitman",
    is_partner_listing: false,
    price_cents: 8000,
    raw_price_cents: 8000,
    image_url: null,
    created_at: new Date("2026-10-10T10:00:00Z"),
    updated_at: new Date("2026-10-10T10:00:00Z"),
    ...overrides,
  };
}

export function sale(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    ...base,
    sale_id: "00000000-0000-0000-0000-000000000501",
    listing_id: null,
    sold_at: new Date("2026-09-01T10:00:00Z"),
    source: "cfs",
    sale_url: "https://example.com/sold/1",
    price_cents: 12000,
    created_at: new Date("2026-09-01T11:00:00Z"),
    ...overrides,
  };
}
