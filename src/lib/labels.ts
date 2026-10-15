import type { Confidence } from "./engine/match";
import type { OpportunityStatus } from "./scan/lifecycle";

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: "New",
  watching: "Watching",
  dismissed: "Dismissed",
  expired: "Expired",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "High: same Kickio product",
  medium: "Medium: attributes match",
  low: "Low: check manually",
};

// Kickio's sales_history.source values.
export const SALE_SOURCE_LABELS: Record<string, string> = {
  kickio: "Kickio marketplace",
  cfs: "Classic Football Shirts",
  vfs: "Vintage Football Shirts",
  ebay: "eBay",
  shopify: "Shopify stores",
  woocommerce: "WooCommerce stores",
  vinted: "Vinted",
  manual: "Entered by Kickio admin",
  scrape: "Scraped",
};

export function saleSourceLabel(source: string): string {
  return SALE_SOURCE_LABELS[source] ?? source;
}

export function listingStatusLabel(status: string, prepStatus: string | null): string {
  if (status === "pending") {
    if (prepStatus === "preparing") return "Approved, photos in prep";
    if (prepStatus === "needs_attention") return "Approved, photo prep failed";
    return "Awaiting review";
  }
  if (status === "reserved") return "Live, in someone's checkout";
  if (status === "active") return "Live";
  return status;
}
