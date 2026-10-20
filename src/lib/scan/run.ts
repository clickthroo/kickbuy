// The scanner. Reads Kickio (read-only), values every listing in scope, and
// records opportunities, price snapshots, alerts and the scan itself in
// KickBuy's database. It never writes to Kickio.
//
// Full scan: every listing. Runs first, then at least daily, and whenever a
// matching setting changes.
// Incremental scan: listings changed since the last scan, listings that
// could be affected by sales recorded since then, and every open
// opportunity (so sold, removed or repriced listings expire promptly).
//
// Sales are small (tens of thousands of narrow rows) and are loaded in pages
// into a server-side index on every run, so a sale being excluded or
// refunded is picked up on the next scan.

import type postgres from "postgres";
import { evaluateListing, type Evaluation, SalesIndex } from "../engine/evaluate";
import { norm } from "../engine/normalise";
import { notAFootballShirt } from "../engine/scope";
import type { FxLookup, InventoryRow, SaleRow } from "../engine/types";
import { type AppSettings, loadSettings } from "../settings";
import { decide, type ExistingOpportunity } from "./lifecycle";

export type Databases = { kickio: postgres.Sql; app: postgres.Sql };

export type ScanOptions = {
  trigger: "cron" | "manual";
  userId?: string | null;
  forceFull?: boolean;
  // Cron calls every few minutes; only scan when the configured interval
  // has passed since the last scan started.
  respectInterval?: boolean;
  now?: Date;
};

export type ScanResult =
  | { ran: false; reason: string }
  | { ran: true; runId: string; kind: "full" | "incremental"; stats: ScanStats };

export type ScanStats = {
  listingsScanned: number;
  salesLoaded: number;
  matched: number;
  insufficientData: number;
  unmatchable: number;
  opportunitiesNew: number;
  opportunitiesUpdated: number;
  opportunitiesExpired: number;
  alertsCreated: number;
};

// Kickio's own stock ("Kickio Direct", the house seller account that
// KickAccount values). Kickio already owns it, so it's never a buying
// opportunity.
export const EXCLUDED_SELLER_IDS = ["ee2ce3bb-30d8-4f94-8cfd-a575866af57e"];

const PAGE = 2000;
const FULL_SCAN_EVERY_MS = 24 * 60 * 60 * 1000;
const STUCK_AFTER_MS = 15 * 60 * 1000;
// Re-read a little before the watermark so commits that were in flight when
// the last scan read Kickio aren't missed.
const OVERLAP_MS = 5 * 60 * 1000;

const INVENTORY_COLUMNS = `listing_id, product_id, seller_id, title, status, prep_status, source, source_url,
  source_name, is_partner_listing, price_cents, raw_price_cents, currency, size, condition, team, team_id,
  season, shirt_type, manufacturer, gender, issue, special_edition, sleeves, signed, boxed_edition,
  player_name, shirt_number, image_url, description, created_at, updated_at`;

export async function runScan(db: Databases, opts: ScanOptions): Promise<ScanResult> {
  const now = opts.now ?? new Date();
  const settings = await loadSettings(db.app);

  // A scan that died (timeout, crash) leaves a 'running' row; clear it.
  await db.app`
    update kickbuy.scan_runs set status = 'failed', finished_at = now(), error = 'Did not finish (timed out or crashed)'
    where status = 'running' and started_at < ${new Date(now.getTime() - STUCK_AFTER_MS)}
  `;

  const [last] = await db.app<{ started_at: Date }[]>`
    select started_at from kickbuy.scan_runs order by started_at desc limit 1
  `;
  if (opts.respectInterval && last && now.getTime() - last.started_at.getTime() < settings.scanIntervalMinutes * 60_000 - 30_000) {
    return { ran: false, reason: "Not due yet" };
  }

  const [lastOk] = await db.app<{ kickio_watermark: Date }[]>`
    select kickio_watermark from kickbuy.scan_runs
    where status = 'succeeded' and kickio_watermark is not null
    order by started_at desc limit 1
  `;
  const [lastFull] = await db.app<{ started_at: Date }[]>`
    select started_at from kickbuy.scan_runs where status = 'succeeded' and kind = 'full'
    order by started_at desc limit 1
  `;
  const full =
    opts.forceFull ||
    !lastOk ||
    !lastFull ||
    now.getTime() - lastFull.started_at.getTime() > FULL_SCAN_EVERY_MS ||
    settings.updatedAt > lastFull.started_at;
  const kind = full ? "full" : "incremental";

  let runId: string;
  try {
    [{ id: runId }] = await db.app<{ id: string }[]>`
      insert into kickbuy.scan_runs (kind, trigger, triggered_by, settings, started_at)
      values (${kind}, ${opts.trigger}, ${opts.userId ?? null}, ${db.app.json(settingsSnapshot(settings))}, ${now})
      returning id
    `;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ran: false, reason: "Another scan is running" };
    throw e;
  }

  const started = Date.now();
  try {
    const stats = await scan(db, runId, settings, full ? null : lastOk.kickio_watermark, now);
    await db.app`
      update kickbuy.scan_runs set
        status = 'succeeded', finished_at = now(), duration_ms = ${Date.now() - started},
        kickio_watermark = ${stats.watermark},
        listings_scanned = ${stats.listingsScanned}, sales_loaded = ${stats.salesLoaded},
        matched = ${stats.matched}, insufficient_data = ${stats.insufficientData}, unmatchable = ${stats.unmatchable},
        opportunities_new = ${stats.opportunitiesNew}, opportunities_updated = ${stats.opportunitiesUpdated},
        opportunities_expired = ${stats.opportunitiesExpired}, alerts_created = ${stats.alertsCreated}
      where id = ${runId}
    `;
    const { watermark, ...rest } = stats;
    void watermark;
    return { ran: true, runId, kind, stats: rest };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.app`
      update kickbuy.scan_runs set status = 'failed', finished_at = now(), duration_ms = ${Date.now() - started},
        error = ${message.slice(0, 2000)}
      where id = ${runId}
    `;
    throw e;
  }
}

function settingsSnapshot(s: AppSettings) {
  return {
    minDiscountPct: s.minDiscountPct,
    maxSaleAgeMonths: s.maxSaleAgeMonths,
    requireExactSize: s.requireExactSize,
    saleSources: s.saleSources,
    alertsEnabled: s.alertsEnabled,
  };
}

async function scan(
  db: Databases,
  runId: string,
  settings: AppSettings,
  since: Date | null,
  now: Date,
): Promise<ScanStats & { watermark: Date }> {
  const [{ now: watermark }] = await db.kickio<{ now: Date }[]>`select now() as now`;

  const [teamRows, fx] = await Promise.all([
    db.kickio<{ team_id: string; name_norm: string }[]>`select team_id, name_norm from kickbuy.team_names`,
    loadFx(db),
  ]);
  const teamByName = new Map<string, string>();
  const namesByTeam = new Map<string, string[]>();
  for (const t of teamRows) {
    if (!t.name_norm) continue;
    teamByName.set(t.name_norm, t.team_id);
    namesByTeam.set(t.team_id, [...(namesByTeam.get(t.team_id) ?? []), t.name_norm]);
  }
  const teams = (name: string) => teamByName.get(name) ?? null;

  const sales = await loadSales(db.kickio);
  const index = new SalesIndex(sales, teams);

  const existing = new Map(
    (
      await db.app<(ExistingOpportunity & { listing_id: string })[]>`
        select listing_id, status, dismissed_ask_pence from kickbuy.opportunities
      `
    ).map((o) => [o.listing_id, o]),
  );

  // Which listings to evaluate.
  let listings: InventoryRow[];
  let checkedIds: Set<string>; // opportunities whose listing we looked for
  if (since === null) {
    listings = await loadInventory(db.kickio, {});
    checkedIds = new Set(existing.keys());
  } else {
    const from = new Date(since.getTime() - OVERLAP_MS);
    const changed = await loadInventory(db.kickio, { changedSince: from });

    // Listings that a newly recorded sale could now value.
    const newSales = sales.filter((s) => s.created_at.getTime() >= from.getTime());
    const productIds = [...new Set(newSales.map((s) => s.product_id).filter((p): p is string => !!p))];
    const teamNames = new Set<string>();
    for (const s of newSales) {
      const n = norm(s.team);
      if (!n) continue;
      teamNames.add(n);
      const id = s.team_id ?? teamByName.get(n);
      for (const alias of (id && namesByTeam.get(id)) || []) teamNames.add(alias);
    }
    const affected =
      productIds.length || teamNames.size
        ? await loadInventory(db.kickio, { productIds, teamNames: [...teamNames] })
        : [];

    const open = [...existing.entries()].filter(([, o]) => o.status !== "expired").map(([id]) => id);
    const reopened = open.length ? await loadInventory(db.kickio, { listingIds: open }) : [];

    const byId = new Map<string, InventoryRow>();
    for (const l of [...changed, ...affected, ...reopened]) byId.set(l.listing_id, l);
    listings = [...byId.values()];
    checkedIds = new Set(open);
  }

  // Items filed under Football Shirts that aren't one are never valued, and
  // any opportunity already raised for one is removed for good.
  const listingsScanned = listings.length;
  const notShirts = new Map<string, GoneReason>();
  listings = listings.filter((l) => {
    const reason = notAFootballShirt(l);
    if (!reason) return true;
    if (existing.has(l.listing_id)) {
      notShirts.set(l.listing_id, { reason, remove: true });
      checkedIds.add(l.listing_id);
    }
    return false;
  });

  const evaluations = new Map<string, { listing: InventoryRow; evaluation: Evaluation }>();
  const stats = {
    listingsScanned,
    salesLoaded: sales.length,
    matched: 0,
    insufficientData: 0,
    unmatchable: listingsScanned - listings.length,
    opportunitiesNew: 0,
    opportunitiesUpdated: 0,
    opportunitiesExpired: 0,
    alertsCreated: 0,
  };
  for (const listing of listings) {
    const evaluation = evaluateListing(listing, index, settings, fx, now);
    evaluations.set(listing.listing_id, { listing, evaluation });
    if (evaluation.kind === "priced") stats.matched += 1;
    else if (evaluation.kind === "insufficient_data") stats.insufficientData += 1;
    else stats.unmatchable += 1;
  }

  const gone = await whyGone(
    db.kickio,
    [...checkedIds].filter((id) => !evaluations.has(id) && !notShirts.has(id)),
  );
  for (const [id, g] of notShirts) gone.set(id, g);
  await record(db.app, runId, settings, now, evaluations, existing, checkedIds, stats, gone);
  return { ...stats, watermark };
}

export const SHIRT_CATEGORY = "Football Shirts";

export type GoneReason = { reason: string; remove: boolean };

// For opportunities whose listing has left the inventory: why it left.
// Moving out of Football Shirts removes the opportunity for good; anything
// else expires it with the real reason.
async function whyGone(sql: postgres.Sql, listingIds: string[]): Promise<Map<string, GoneReason>> {
  const out = new Map<string, GoneReason>();
  for (let i = 0; i < listingIds.length; i += 1000) {
    const rows = await sql<{ listing_id: string; status: string; category: string | null; deleted: boolean }[]>`
      select listing_id, status, category, deleted from kickbuy.listing_states
      where listing_id = any(${listingIds.slice(i, i + 1000)}::uuid[])
    `;
    for (const r of rows) out.set(r.listing_id, goneReason(r));
  }
  return out;
}

export function goneReason(r: { status: string; category: string | null; deleted: boolean }): GoneReason {
  if (r.category !== SHIRT_CATEGORY) {
    return { reason: `Not a football shirt: moved to "${r.category ?? "no category"}" on Kickio`, remove: true };
  }
  if (r.deleted) return { reason: "Deleted from Kickio", remove: false };
  if (r.status === "sold") return { reason: "Sold on Kickio", remove: false };
  if (r.status === "removed") return { reason: "Removed from Kickio", remove: false };
  if (r.status === "cancelled") return { reason: "Cancelled on Kickio", remove: false };
  if (r.status === "draft") return { reason: "Moved back to draft on Kickio", remove: false };
  return { reason: "Listing is no longer available", remove: false };
}

async function loadFx(db: Databases): Promise<FxLookup> {
  const current = await db.kickio<{ currency_code: string; rate_to_gbp: string; last_updated: Date }[]>`
    select currency_code, rate_to_gbp, last_updated from kickbuy.exchange_rates
  `;
  const rows = current
    .filter((r) => Number(r.rate_to_gbp) > 0)
    .map((r) => ({
      currency_code: r.currency_code.toUpperCase(),
      rate_date: r.last_updated.toISOString().slice(0, 10),
      rate_to_gbp: r.rate_to_gbp,
    }));
  if (rows.length) {
    await db.app`
      insert into kickbuy.fx_rates ${db.app(rows)}
      on conflict (currency_code, rate_date) do update set rate_to_gbp = excluded.rate_to_gbp
    `;
  }
  const history = await db.app<{ currency_code: string; rate_date: Date; rate_to_gbp: string }[]>`
    select currency_code, rate_date, rate_to_gbp from kickbuy.fx_rates order by currency_code, rate_date
  `;
  return fxLookup(history.map((h) => ({ currency: h.currency_code, date: h.rate_date, rate: Number(h.rate_to_gbp) })));
}

// The rate recorded on or before the date; failing that, one recorded within
// 31 days after it (KickBuy only started recording rates when it was set up).
export function fxLookup(history: { currency: string; date: Date; rate: number }[]): FxLookup {
  const byCurrency = new Map<string, { t: number; rate: number }[]>();
  for (const h of history) {
    const list = byCurrency.get(h.currency) ?? [];
    list.push({ t: h.date.getTime(), rate: h.rate });
    byCurrency.set(h.currency, list);
  }
  for (const list of byCurrency.values()) list.sort((a, b) => a.t - b.t);
  return (currency, on) => {
    const list = byCurrency.get(currency.toUpperCase());
    if (!list?.length) return null;
    const t = on.getTime();
    let best: { t: number; rate: number } | null = null;
    for (const r of list) if (r.t <= t) best = r;
    if (best) return best.rate;
    return list[0].t - t <= 31 * 86_400_000 ? list[0].rate : null;
  };
}

async function loadSales(sql: postgres.Sql): Promise<SaleRow[]> {
  const out: SaleRow[] = [];
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const page = await sql<SaleRow[]>`
      select sale_id, product_id, listing_id, sold_at, price_cents, currency, condition, size, source,
             source_url, sale_url, team, team_id, season, shirt_type, manufacturer, gender, issue,
             special_edition, sleeves, signed, boxed_edition, player_name, shirt_number, created_at
      from kickbuy.sales
      where sale_id > ${after}
      order by sale_id
      limit ${PAGE * 2}
    `;
    out.push(...page);
    if (page.length < PAGE * 2) return out;
    after = page[page.length - 1].sale_id;
  }
}

type InventoryFilter = {
  changedSince?: Date;
  listingIds?: string[];
  productIds?: string[];
  teamNames?: string[];
};

// Keyset-paginated reads of Kickio's inventory view.
async function loadInventory(sql: postgres.Sql, f: InventoryFilter): Promise<InventoryRow[]> {
  const out: InventoryRow[] = [];
  let after = "00000000-0000-0000-0000-000000000000";
  const where = [
    f.changedSince ? sql`updated_at > ${f.changedSince}` : null,
    f.listingIds ? sql`listing_id = any(${f.listingIds}::uuid[])` : null,
    f.productIds || f.teamNames
      ? sql`(product_id = any(${f.productIds ?? []}::uuid[]) or lower(btrim(team)) = any(${f.teamNames ?? []}::text[]))`
      : null,
  ]
    .filter((w) => w !== null)
    .reduce((acc, w) => sql`${acc} and ${w}`, sql``);
  for (;;) {
    const page = await sql<InventoryRow[]>`
      select ${sql.unsafe(INVENTORY_COLUMNS)}
      from kickbuy.inventory
      where listing_id > ${after}
        and seller_id <> all(${EXCLUDED_SELLER_IDS}::uuid[])
        ${where}
      order by listing_id
      limit ${PAGE}
    `;
    out.push(...page);
    if (page.length < PAGE) return out;
    after = page[page.length - 1].listing_id;
  }
}

async function record(
  sql: postgres.Sql,
  runId: string,
  settings: AppSettings,
  now: Date,
  evaluations: Map<string, { listing: InventoryRow; evaluation: Evaluation }>,
  existing: Map<string, ExistingOpportunity>,
  checkedIds: Set<string>,
  stats: ScanStats,
  gone: Map<string, GoneReason>,
) {
  const alerted = new Map(
    (
      await sql<{ listing_id: string; min_ask: number }[]>`
        select listing_id, min(ask_pence)::int as min_ask from kickbuy.alerts group by listing_id
      `
    ).map((a) => [a.listing_id, a.min_ask]),
  );
  const lastSnapshots = new Map(
    (
      await sql<{ listing_id: string; ask_pence: number; listing_status: string; ref_sale_id: string | null; qualifies: boolean }[]>`
        select distinct on (listing_id) listing_id, ask_pence, listing_status, ref_sale_id, qualifies
        from kickbuy.price_snapshots order by listing_id, observed_at desc, id desc
      `
    ).map((s) => [s.listing_id, s]),
  );

  const upserts: Record<string, unknown>[] = [];
  const expiries: { listing_id: string; reason: string }[] = [];
  const alerts: { listing_id: string; ask_pence: number; ref_price_pence: number; discount_pct: number; kind: string }[] = [];
  const snapshots: Record<string, unknown>[] = [];

  const ids = new Set([...evaluations.keys(), ...checkedIds]);
  for (const listingId of ids) {
    const entry = evaluations.get(listingId) ?? null;
    const evaluation = entry?.evaluation ?? null;
    const prior = existing.get(listingId) ?? null;
    const d = decide(prior, evaluation, alerted.get(listingId) ?? null, settings.alertsEnabled);

    if (evaluation?.kind === "priced" && entry) {
      const last = lastSnapshots.get(listingId);
      if (
        (evaluation.qualifies || prior) &&
        (!last ||
          last.ask_pence !== evaluation.askPence ||
          last.listing_status !== entry.listing.status ||
          last.ref_sale_id !== evaluation.reference.saleId ||
          last.qualifies !== evaluation.qualifies)
      ) {
        snapshots.push({
          listing_id: listingId,
          scan_run_id: runId,
          listing_status: entry.listing.status,
          ask_pence: evaluation.askPence,
          ref_sale_id: evaluation.reference.saleId,
          ref_price_pence: evaluation.reference.pence,
          discount_pct: evaluation.discountPct,
          qualifies: evaluation.qualifies,
        });
      }
    }

    if (!d.write) continue;
    if (d.status === "expired") {
      if (prior?.status !== "expired") stats.opportunitiesExpired += 1;
      expiries.push({
        listing_id: listingId,
        reason: (evaluation === null && gone.get(listingId)?.reason) || d.expiredReason || "Expired",
      });
      // Keep the latest prices on the expired row when we still have them.
      if (evaluation?.kind !== "priced" || !entry) continue;
    } else if (!prior || prior.status === "expired") {
      stats.opportunitiesNew += 1;
    } else {
      stats.opportunitiesUpdated += 1;
    }
    if (evaluation?.kind === "priced" && entry) {
      upserts.push(opportunityRow(entry.listing, evaluation, d.status, d.expiredReason, now));
      if (d.alert) {
        alerts.push({
          listing_id: listingId,
          ask_pence: evaluation.askPence,
          ref_price_pence: evaluation.reference.pence,
          discount_pct: evaluation.discountPct,
          kind: d.alert,
        });
      }
    }
  }

  await sql.begin(async (tx) => {
    for (let i = 0; i < upserts.length; i += 500) {
      const batch = upserts.slice(i, i + 500);
      // A person may have changed the status while the scan was running;
      // their change wins.
      await tx`
        insert into kickbuy.opportunities ${tx(batch)}
        on conflict (listing_id) do update set
          status = case when kickbuy.opportunities.status_changed_at > ${now}
                        then kickbuy.opportunities.status else excluded.status end,
          listing_status = excluded.listing_status, prep_status = excluded.prep_status,
          pre_live = excluded.pre_live, title = excluded.title, product_id = excluded.product_id,
          team = excluded.team, season = excluded.season, shirt_type = excluded.shirt_type,
          manufacturer = excluded.manufacturer, player_name = excluded.player_name, size = excluded.size,
          condition = excluded.condition, image_url = excluded.image_url, source_name = excluded.source_name,
          source_url = excluded.source_url,
          listed_at = excluded.listed_at, ask_pence = excluded.ask_pence, ask_currency = excluded.ask_currency,
          ref_sale_id = excluded.ref_sale_id, ref_price_pence = excluded.ref_price_pence,
          ref_original_pence = excluded.ref_original_pence, ref_currency = excluded.ref_currency,
          ref_fx_rate = excluded.ref_fx_rate, ref_sold_at = excluded.ref_sold_at, ref_source = excluded.ref_source,
          ref_url = excluded.ref_url, ref_size = excluded.ref_size, ref_stale = excluded.ref_stale,
          discount_pct = excluded.discount_pct, saving_pence = excluded.saving_pence,
          confidence = excluded.confidence, needs_review = excluded.needs_review,
          match_notes = excluded.match_notes, recent_sales = excluded.recent_sales,
          median_pence = excluded.median_pence, comparable_count = excluded.comparable_count,
          qualifies = excluded.qualifies, last_evaluated_at = excluded.last_evaluated_at,
          last_changed_at = case
            when (kickbuy.opportunities.ask_pence, kickbuy.opportunities.ref_sale_id, kickbuy.opportunities.status)
                 is distinct from (excluded.ask_pence, excluded.ref_sale_id, excluded.status)
            then excluded.last_evaluated_at else kickbuy.opportunities.last_changed_at end,
          expired_at = case when excluded.status = 'expired'
                            then coalesce(kickbuy.opportunities.expired_at, excluded.last_evaluated_at) end,
          expired_reason = excluded.expired_reason,
          first_detected_at = case when kickbuy.opportunities.status = 'expired' and excluded.status <> 'expired'
                                   then excluded.last_evaluated_at else kickbuy.opportunities.first_detected_at end
      `;
    }
    if (expiries.length) {
      const rows = expiries.map((e) => ({ listing_id: e.listing_id, reason: e.reason }));
      await tx`
        update kickbuy.opportunities o set
          status = 'expired', qualifies = false,
          expired_at = coalesce(o.expired_at, ${now}), expired_reason = v.reason,
          last_evaluated_at = ${now},
          last_changed_at = case when o.status <> 'expired' then ${now} else o.last_changed_at end
        from (select * from jsonb_to_recordset(${tx.json(rows)}) as x(listing_id uuid, reason text)) v
        where o.listing_id = v.listing_id
          and (o.status_changed_at is null or o.status_changed_at <= ${now})
      `;
    }
    for (let i = 0; i < snapshots.length; i += 1000) {
      await tx`insert into kickbuy.price_snapshots ${tx(snapshots.slice(i, i + 1000))}`;
    }
    const removals = [...gone.entries()].filter(([, g]) => g.remove);
    if (removals.length) {
      const rows = removals.map(([listing_id, g]) => ({ listing_id, reason: g.reason }));
      await tx`
        update kickbuy.opportunities o set removed_at = ${now}, removed_reason = v.reason
        from (select * from jsonb_to_recordset(${tx.json(rows)}) as x(listing_id uuid, reason text)) v
        where o.listing_id = v.listing_id and o.removed_at is null
      `;
    }
    if (alerts.length) {
      const created = await tx<{ id: string }[]>`
        insert into kickbuy.alerts (opportunity_id, listing_id, ask_pence, ref_price_pence, discount_pct, kind, scan_run_id)
        select o.id, v.listing_id, v.ask_pence, v.ref_price_pence, v.discount_pct, v.kind, ${runId}
        from jsonb_to_recordset(${tx.json(alerts)})
          as v(listing_id uuid, ask_pence int, ref_price_pence int, discount_pct numeric, kind text)
        join kickbuy.opportunities o on o.listing_id = v.listing_id
        where o.removed_at is null
        on conflict (listing_id, ask_pence) do nothing
        returning id
      `;
      stats.alertsCreated = created.length;
    }
  });
}

function opportunityRow(
  l: InventoryRow,
  e: Extract<Evaluation, { kind: "priced" }>,
  status: string,
  expiredReason: string | null,
  now: Date,
) {
  const r = e.reference;
  return {
    listing_id: l.listing_id,
    status,
    listing_status: l.status,
    prep_status: l.prep_status,
    pre_live: l.status === "pending",
    title: l.title,
    product_id: l.product_id,
    team: l.team,
    season: l.season,
    shirt_type: l.shirt_type,
    manufacturer: l.manufacturer,
    player_name: l.player_name,
    size: l.size,
    condition: l.condition ?? "",
    image_url: l.image_url,
    source_name: l.source_name,
    source_url: safeUrl(l.source_url),
    listed_at: l.created_at,
    ask_pence: e.askPence,
    ask_currency: l.currency.toUpperCase(),
    ref_sale_id: r.saleId,
    ref_price_pence: r.pence,
    ref_original_pence: r.originalPence,
    ref_currency: r.currency,
    ref_fx_rate: r.fxRate,
    ref_sold_at: r.soldAt,
    ref_source: r.source,
    ref_url: r.url,
    ref_size: r.size,
    ref_stale: r.stale,
    discount_pct: e.discountPct,
    saving_pence: e.savingPence,
    confidence: e.confidence,
    needs_review: e.needsReview,
    match_notes: e.notes,
    recent_sales: e.recent.map((c) => ({
      saleId: c.saleId,
      soldAt: c.soldAt.toISOString(),
      pence: c.pence,
      originalPence: c.originalPence,
      currency: c.currency,
      source: c.source,
      url: c.url,
      size: c.size,
      confidence: c.confidence,
    })),
    median_pence: e.medianPence,
    comparable_count: e.comparableCount,
    qualifies: e.qualifies,
    last_evaluated_at: now,
    expired_at: status === "expired" ? now : null,
    expired_reason: expiredReason,
  };
}

// Only http(s) links are stored, so nothing else can end up in an href.
function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
