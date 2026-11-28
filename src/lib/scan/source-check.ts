// Reads the shop's own listing page for open opportunities whose source URL
// is just an item number (eBay, Vinted), and records its title and whether it
// has ended. Kickio keeps neither: it can file an eBay "Training" top as a
// Home shirt, or keep showing an eBay listing that ended weeks ago.
//
// A title that says it isn't a football shirt removes the opportunity for
// good; an ended listing expires it. The scanner reads the same records, so
// neither comes back on the next scan. Pages that can't be read (blocked,
// timed out) are retried later and change nothing.

import type postgres from "postgres";
import { titleSaysNotAShirt } from "../engine/scope";

export const OPAQUE_SOURCE = /^https:\/\/(www\.)?(ebay\.(co\.uk|com|ie|de|fr|it|es)\/itm\/|vinted\.[a-z.]+\/items\/)/;
const PER_RUN = 25;
const CONCURRENCY = 5;
const RETRY_AFTER = "6 hours";

export type SourcePage = { title: string | null; ended: boolean };
export type SourceCheck = { listing_id: string; not_shirt: string | null; ended: boolean };

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// The listing's title and whether it has ended, from the page's HTML. Throws
// when the page is a bot check rather than the listing.
export function readSourcePage(url: string, html: string): SourcePage {
  const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1];
  const tag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  const raw = og ?? tag ?? null;
  if (raw && /pardon our interruption|security measure|just a moment|access denied|attention required/i.test(raw)) {
    throw new Error(`bot check: ${raw.slice(0, 80)}`);
  }
  const title = raw ? decode(raw).replace(/\s*[|-]\s*(ebay|vinted)\s*$/i, "") || null : null;
  const ended = /ebay\./.test(url) && /this listing (has|was) ended|this listing was ended by the seller|the seller has ended this listing/i.test(html);
  return { title, ended };
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      "accept-language": "en-GB,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function checkSources(
  sql: postgres.Sql,
  opts: { limit?: number; fetchHtml?: (url: string) => Promise<string> } = {},
): Promise<{ checked: number; removed: number; ended: number; failed: number }> {
  const fetchHtml = opts.fetchHtml ?? fetchPage;
  const due = await sql<{ listing_id: string; source_url: string }[]>`
    select o.listing_id, o.source_url
    from kickbuy.opportunities o
    left join kickbuy.source_checks c on c.listing_id = o.listing_id and c.source_url = o.source_url
    where o.removed_at is null and o.status in ('new', 'watching')
      and o.source_url ~ ${OPAQUE_SOURCE.source}
      and (c.listing_id is null or (c.error is not null and c.checked_at < now() - ${RETRY_AFTER}::interval))
    order by o.first_detected_at desc
    limit ${opts.limit ?? PER_RUN}
  `;
  const result = { checked: 0, removed: 0, ended: 0, failed: 0 };
  // A few pages at a time keeps a slow site well inside the cron's time limit.
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    await Promise.all(due.slice(i, i + CONCURRENCY).map((d) => checkOne(sql, d, fetchHtml, result)));
  }
  return result;
}

async function checkOne(
  sql: postgres.Sql,
  { listing_id, source_url }: { listing_id: string; source_url: string },
  fetchHtml: (url: string) => Promise<string>,
  result: { checked: number; removed: number; ended: number; failed: number },
) {
  let page: SourcePage | null = null;
  let error: string | null = null;
  try {
    page = readSourcePage(source_url, await fetchHtml(source_url));
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    result.failed += 1;
  }
  const notShirt = page ? titleSaysNotAShirt(page.title) : null;
  await sql`
    insert into kickbuy.source_checks (listing_id, source_url, title, ended, not_shirt, error, checked_at)
    values (${listing_id}, ${source_url}, ${page?.title ?? null}, ${page?.ended ?? false}, ${notShirt}, ${error}, now())
    on conflict (listing_id) do update set
      source_url = excluded.source_url, title = excluded.title, ended = excluded.ended,
      not_shirt = excluded.not_shirt, error = excluded.error, checked_at = excluded.checked_at
  `;
  if (!page) return;
  result.checked += 1;
  if (notShirt) {
    await sql`
      update kickbuy.opportunities set status = 'expired', qualifies = false,
        expired_at = coalesce(expired_at, now()), expired_reason = ${notShirt},
        removed_at = now(), removed_reason = ${notShirt}
      where listing_id = ${listing_id} and removed_at is null
    `;
    result.removed += 1;
  } else if (page.ended) {
    await sql`
      update kickbuy.opportunities set status = 'expired', qualifies = false,
        expired_at = coalesce(expired_at, now()), expired_reason = 'The shop listing has ended'
      where listing_id = ${listing_id} and status <> 'expired'
    `;
    result.ended += 1;
  }
}

// What the scanner needs from earlier checks: items to leave out.
export async function loadSourceChecks(sql: postgres.Sql): Promise<Map<string, SourceCheck>> {
  const rows = await sql<SourceCheck[]>`
    select listing_id, not_shirt, ended from kickbuy.source_checks
    where error is null and (not_shirt is not null or ended)
  `;
  return new Map(rows.map((r) => [r.listing_id, r]));
}
