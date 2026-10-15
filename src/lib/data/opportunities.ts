import "server-only";
import type postgres from "postgres";
import { app } from "../db";
import { timed } from "../timed";
import type { Confidence } from "../engine/match";
import type { Filters } from "../filters";
import type { OpportunityStatus } from "../scan/lifecycle";

export const PAGE_SIZE = 50;

export type OpportunityRow = {
  id: string;
  listing_id: string;
  status: OpportunityStatus;
  listing_status: string;
  prep_status: string | null;
  pre_live: boolean;
  title: string;
  product_id: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  manufacturer: string | null;
  player_name: string | null;
  size: string | null;
  condition: string;
  image_url: string | null;
  source_name: string | null;
  source_url: string | null;
  listed_at: Date;
  ask_pence: number;
  ask_currency: string;
  ref_sale_id: string;
  ref_price_pence: number;
  ref_original_pence: number;
  ref_currency: string;
  ref_fx_rate: string | null;
  ref_sold_at: Date;
  ref_source: string;
  ref_url: string | null;
  ref_size: string | null;
  ref_stale: boolean;
  discount_pct: string;
  saving_pence: number;
  confidence: Confidence;
  needs_review: boolean;
  match_notes: string[];
  recent_sales: {
    saleId: string;
    soldAt: string;
    pence: number;
    originalPence: number;
    currency: string;
    source: string;
    url: string | null;
    size: string | null;
    confidence: Confidence;
  }[];
  median_pence: number | null;
  comparable_count: number;
  qualifies: boolean;
  first_detected_at: Date;
  last_evaluated_at: Date;
  last_changed_at: Date;
  expired_at: Date | null;
  expired_reason: string | null;
};

function whereFor(sql: postgres.Sql, f: Filters, opts: { preLiveOnly?: boolean } = {}) {
  const conds = [
    f.status === "open"
      ? sql`status in ('new', 'watching')`
      : f.status === "all"
        ? null
        : sql`status = ${f.status}`,
    opts.preLiveOnly || f.listing === "prelive" ? sql`pre_live` : f.listing === "live" ? sql`not pre_live` : null,
    f.q ? sql`title ilike ${"%" + f.q + "%"}` : null,
    f.club ? sql`team ilike ${"%" + f.club + "%"}` : null,
    f.season ? sql`season ilike ${f.season + "%"}` : null,
    f.condition ? sql`condition = ${f.condition}` : null,
    f.minPrice !== null ? sql`ask_pence >= ${Math.round(f.minPrice * 100)}` : null,
    f.maxPrice !== null ? sql`ask_pence <= ${Math.round(f.maxPrice * 100)}` : null,
    f.minDiscount !== null ? sql`discount_pct >= ${f.minDiscount}` : null,
    f.confidence ? sql`confidence = ${f.confidence}` : null,
    f.listedSince ? sql`listed_at >= ${f.listedSince}::date` : null,
    f.refSource ? sql`ref_source = ${f.refSource}` : null,
  ].filter((c) => c !== null);
  return conds.reduce((acc, c) => sql`${acc} and ${c}`, sql`true`);
}

function orderFor(sql: postgres.Sql, f: Filters) {
  switch (f.sort) {
    case "saving":
      return sql`saving_pence desc, discount_pct desc`;
    case "newest":
      return sql`listed_at desc`;
    case "confidence":
      return sql`case confidence when 'high' then 3 when 'medium' then 2 else 1 end desc, discount_pct desc`;
    default:
      return sql`discount_pct desc, saving_pence desc`;
  }
}

export async function listOpportunities(f: Filters, opts: { preLiveOnly?: boolean; limit?: number } = {}) {
  const sql = app();
  const where = whereFor(sql, f, opts);
  const limit = opts.limit ?? PAGE_SIZE;
  const offset = opts.limit ? 0 : (f.page - 1) * PAGE_SIZE;
  const [rows, [totals]] = await Promise.all([
    sql<OpportunityRow[]>`
      select * from kickbuy.opportunities where ${where}
      order by ${orderFor(sql, f)}, id
      limit ${limit} offset ${offset}
    `,
    sql<{ n: number; saving: number | null }[]>`
      select count(*)::int as n, sum(saving_pence)::int as saving from kickbuy.opportunities where ${where}
    `,
  ]);
  return { rows, total: totals.n, savingPence: totals.saving ?? 0 };
}

export async function getOpportunity(id: string) {
  const sql = app();
  const [o] = await timed("opportunity", sql<OpportunityRow[]>`select * from kickbuy.opportunities where id = ${id}`);
  if (!o) return null;
  // One after another: parallel queries through Supabase's pooler stalled.
  const snapshots = await timed(
    "price_snapshots",
    sql<{ observed_at: Date; listing_status: string; ask_pence: number; ref_price_pence: number | null; discount_pct: string | null; qualifies: boolean }[]>`
      select observed_at, listing_status, ask_pence, ref_price_pence, discount_pct, qualifies
      from kickbuy.price_snapshots where listing_id = ${o.listing_id}
      order by observed_at desc, id desc limit 50
    `,
  );
  const actions = await timed(
    "user_actions",
    sql<{ at: Date; action: string; email: string | null; detail: Record<string, unknown> }[]>`
      select a.at, a.action, u.email, a.detail
      from kickbuy.user_actions a left join kickbuy.app_users u on u.user_id = a.user_id
      where a.opportunity_id = ${id}
      order by a.at desc limit 50
    `,
  );
  const alerts = await timed(
    "alerts",
    sql<{ created_at: Date; kind: string; ask_pence: number; discount_pct: string }[]>`
      select created_at, kind, ask_pence, discount_pct from kickbuy.alerts
      where opportunity_id = ${id} order by created_at desc
    `,
  );
  return { opportunity: o, snapshots, actions, alerts };
}

export async function dashboardSummary() {
  const sql = app();
  const [[open], [lastRun], [lastFull], [running]] = await Promise.all([
    sql<{ n: number; saving: number | null; prelive: number; review: number }[]>`
      select count(*)::int as n, sum(saving_pence)::int as saving,
             count(*) filter (where pre_live)::int as prelive,
             count(*) filter (where needs_review)::int as review
      from kickbuy.opportunities where status in ('new', 'watching')
    `,
    sql<{ status: string; started_at: Date; finished_at: Date | null; kind: string; error: string | null }[]>`
      select status, started_at, finished_at, kind, error from kickbuy.scan_runs
      where status <> 'running' order by started_at desc limit 1
    `,
    sql<{ listings_scanned: number; started_at: Date }[]>`
      select listings_scanned, started_at from kickbuy.scan_runs
      where status = 'succeeded' and kind = 'full' order by started_at desc limit 1
    `,
    sql<{ started_at: Date }[]>`select started_at from kickbuy.scan_runs where status = 'running' limit 1`,
  ]);
  return {
    openCount: open.n,
    openSavingPence: open.saving ?? 0,
    preLiveCount: open.prelive,
    needsReviewCount: open.review,
    itemsScanned: lastFull?.listings_scanned ?? null,
    lastRun: lastRun ?? null,
    running: running ?? null,
  };
}

export async function refSources(): Promise<string[]> {
  const rows = await app()<{ ref_source: string }[]>`
    select distinct ref_source from kickbuy.opportunities order by ref_source
  `;
  return rows.map((r) => r.ref_source);
}
