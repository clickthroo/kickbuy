import "server-only";
import { env } from "./env";

// Public listing page; Kickio also accepts a bare id.
export function kickioListingUrl(listingId: string): string {
  return `${env.kickioSiteUrl}/listings/${listingId}`;
}

// Kickio's review queue. It has no per-listing deep link; find the listing on
// the Listings tab.
export function kickioReviewQueueUrl(): string {
  return `${env.kickioSiteUrl}/admin/review`;
}
