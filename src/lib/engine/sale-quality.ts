// Sales that can't be trusted as evidence of a price, beyond what Kickio's
// own sales view already filters out.
//
// Crawled sales are inferred: a shop's product disappeared, so it's assumed
// sold. Two patterns show that inference failing:
//   - A burst: one shop "selling" BURST_SIZE or more items within the same
//     hour. Vintage shops sell one-off stock a few items a day; a burst is a
//     crawl or site glitch (pages briefly missing, a collection reshuffled).
//   - A repeat: the same product URL "sold" more than once. One-off stock
//     can't sell twice, so it came back, and none of its sales are trusted.
// Kickio's own orders, eBay and Vinted (many sellers on one host, and eBay
// listings can sell several times) are left alone. And a sale of something
// that isn't a football shirt (shorts, a track jacket, a scarf) is never
// evidence for a shirt, whatever product it was linked to.

import { notAFootballShirt } from "./scope";
import type { SaleRow } from "./types";

export const BURST_SIZE = 10;
const BURST_SOURCES = new Set(["kickcrawl"]);
const REPEAT_EXEMPT = new Set(["kickio", "ebay", "vinted", "manual"]);

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function pageKey(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
}

// Why each untrusted sale is untrusted, by sale id.
export function untrustedSales(sales: SaleRow[]): Map<string, string> {
  const out = new Map<string, string>();

  const bursts = new Map<string, SaleRow[]>();
  const pages = new Map<string, SaleRow[]>();
  for (const s of sales) {
    const url = s.sale_url ?? s.source_url;
    const notShirt = notAFootballShirt({ source_url: url, shirt_type: s.shirt_type, description: null });
    if (notShirt) out.set(s.sale_id, notShirt);
    const h = host(url);
    if (BURST_SOURCES.has(s.source) && h) {
      const key = `${s.source}|${h}|${Math.floor(s.sold_at.getTime() / 3_600_000)}`;
      (bursts.get(key) ?? bursts.set(key, []).get(key)!).push(s);
    }
    const page = pageKey(url);
    if (!REPEAT_EXEMPT.has(s.source) && page) {
      (pages.get(page) ?? pages.set(page, []).get(page)!).push(s);
    }
  }
  for (const group of bursts.values()) {
    if (group.length < BURST_SIZE) continue;
    for (const s of group) out.set(s.sale_id, `one of ${group.length} "sales" from ${host(s.sale_url ?? s.source_url)} in the same hour`);
  }
  for (const group of pages.values()) {
    if (group.length < 2) continue;
    for (const s of group) if (!out.has(s.sale_id)) out.set(s.sale_id, `the same item "sold" ${group.length} times`);
  }
  return out;
}

export function trustedSales(sales: SaleRow[]): SaleRow[] {
  const untrusted = untrustedSales(sales);
  return untrusted.size ? sales.filter((s) => !untrusted.has(s.sale_id)) : sales;
}
