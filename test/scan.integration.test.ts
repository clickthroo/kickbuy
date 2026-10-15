// End-to-end scan against real Postgres: applies both migrations to a stub
// of Kickio's tables, connects as the real kickbuy_reader / kickbuy_app
// roles, and runs full and incremental scans.
//
//   KICKBUY_TEST_PG=postgres://postgres@localhost:5432 npm run test:integration
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runScan } from "../src/lib/scan/run";

const base = process.env.KICKBUY_TEST_PG;
const root = path.resolve(__dirname, "..");
const file = (p: string) => readFileSync(path.join(root, p), "utf8");
const url = (db: string, user = "postgres") => {
  const u = new URL(base!);
  u.pathname = `/${db}`;
  u.username = user;
  return u.toString();
};

const P_UTD = "10000000-0000-0000-0000-000000000001";
const P_ARS = "10000000-0000-0000-0000-000000000002";
const L1 = "20000000-0000-0000-0000-000000000001"; // pending, £80 vs £120 → opportunity
const L2 = "20000000-0000-0000-0000-000000000002"; // active, £110 → not yet
const L3 = "20000000-0000-0000-0000-000000000003"; // Mint, no Mint sales
const L4 = "20000000-0000-0000-0000-000000000004"; // Arsenal; only valid sale is close in price
const L5 = "20000000-0000-0000-0000-000000000005"; // "Spurs" alias
const L6 = "20000000-0000-0000-0000-000000000006"; // draft: out of scope
const SOLD = "20000000-0000-0000-0000-000000000009"; // sold listing whose order was refunded

describe.skipIf(!base)("scan (integration)", () => {
  let admin: postgres.Sql;
  let kickioOwner: postgres.Sql;
  let db: { kickio: postgres.Sql; app: postgres.Sql };

  beforeAll(async () => {
    admin = postgres(url("postgres"), { max: 1, onnotice: () => {} });
    for (const name of ["kickbuy_test_kickio", "kickbuy_test_app"]) {
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.unsafe(`create database ${name}`);
    }
    kickioOwner = postgres(url("kickbuy_test_kickio"), { max: 1, onnotice: () => {} });
    await kickioOwner.unsafe(file("test/kickio-stub.sql"));
    await kickioOwner.unsafe(file("db/kickio/0001_kickbuy_read_interface.sql"));
    const appOwner = postgres(url("kickbuy_test_app"), { max: 1, onnotice: () => {} });
    await appOwner.unsafe(file("test/kickbuy-stub.sql"));
    for (const f of readdirSync(path.join(root, "db/kickbuy")).sort()) {
      await appOwner.unsafe(file(`db/kickbuy/${f}`));
    }
    await appOwner.end();

    await seed(kickioOwner);
    db = {
      kickio: postgres(url("kickbuy_test_kickio", "kickbuy_reader"), { max: 2 }),
      app: postgres(url("kickbuy_test_app", "kickbuy_app"), { max: 2 }),
    };
  });

  afterAll(async () => {
    await db?.kickio.end();
    await db?.app.end();
    await kickioOwner?.end();
    await admin?.end();
  });

  it("can't touch Kickio tables as kickbuy_reader", async () => {
    await expect(db.kickio`select 1 from public.listings limit 1`).rejects.toThrow(/permission denied/);
    await expect(db.kickio`delete from kickbuy.inventory`).rejects.toThrow(/read-only|cannot delete/);
  });

  it("exposes only valid sales", async () => {
    const rows = await db.kickio`select listing_id from kickbuy.sales where listing_id is not null`;
    // The refunded sale is out; the sale after an abandoned checkout is in.
    expect(rows.map((r) => r.listing_id)).toEqual([L6]);
    const [n] = await db.kickio`select count(*)::int as n from kickbuy.sales`;
    expect(n.n).toBe(5); // 8 recorded, less refunded, excluded and pending-review
  });

  it("finds opportunities on a full scan", async () => {
    const r = await runScan(db, { trigger: "manual" });
    expect(r).toMatchObject({ ran: true, kind: "full" });
    if (!r.ran) return;
    expect(r.stats.listingsScanned).toBe(5); // the draft isn't in scope

    const opps = await db.app`select * from kickbuy.opportunities order by listing_id`;
    expect(opps.map((o) => o.listing_id)).toEqual([L1, L5]);
    const [o1, o5] = opps;
    expect(o1).toMatchObject({
      status: "new",
      pre_live: true,
      ask_pence: 8000,
      ref_price_pence: 12000,
      discount_pct: "33.33",
      saving_pence: 4000,
      confidence: "high",
      needs_review: false,
      ref_source: "cfs",
      source_url: "https://kit.example/p/1",
    });
    expect(o5).toMatchObject({ pre_live: false, confidence: "medium", discount_pct: "50.00" });

    const alerts = await db.app`select listing_id, kind from kickbuy.alerts order by listing_id`;
    expect(alerts).toEqual([
      { listing_id: L1, kind: "new" },
      { listing_id: L5, kind: "new" },
    ]);
    const [run] = await db.app`select status, matched, insufficient_data, unmatchable from kickbuy.scan_runs`;
    // L4 is priced against the vfs sale; the refunded Kickio sale is ignored.
    expect(run).toMatchObject({ status: "succeeded", matched: 4, insufficient_data: 1, unmatchable: 0 });
  });

  it("respects the scan interval for cron runs", async () => {
    expect(await runScan(db, { trigger: "cron", respectInterval: true })).toEqual({ ran: false, reason: "Not due yet" });
  });

  it("picks up price drops, new sales and removals incrementally", async () => {
    await kickioOwner`update public.listings set price_cents = 7000, updated_at = now() where id = ${L1}`;
    await kickioOwner`update public.listings set status = 'removed', updated_at = now() where id = ${L5}`;
    // A new sale makes L2 (unchanged itself) an opportunity: 45% below.
    await kickioOwner`
      insert into public.sales_history (product_id, sold_at, price_cents, condition, size, source, created_at)
      values (${P_UTD}, '2026-10-14', 20000, 'Very Good', 'L', 'kickio', now())
    `;

    const r = await runScan(db, { trigger: "manual" });
    expect(r).toMatchObject({ ran: true, kind: "incremental" });
    if (!r.ran) return;
    // L1 changed; L1-L3 share the new sale's product; L5 was open but has
    // left the inventory, so it's expired without being scanned.
    expect(r.stats.listingsScanned).toBe(3);

    const opps = Object.fromEntries(
      (await db.app`select listing_id, status, ask_pence, ref_price_pence, expired_reason from kickbuy.opportunities`).map(
        (o) => [o.listing_id, o],
      ),
    );
    // L1 now references the newer Kickio sale.
    expect(opps[L1]).toMatchObject({ status: "new", ask_pence: 7000, ref_price_pence: 20000 });
    expect(opps[L2]).toMatchObject({ status: "new", ask_pence: 11000 });
    expect(opps[L5]).toMatchObject({ status: "expired", expired_reason: "Listing is no longer available" });

    const alerts = await db.app`select listing_id, kind, ask_pence from kickbuy.alerts order by created_at, listing_id`;
    expect(alerts.slice(2)).toEqual([
      { listing_id: L1, kind: "price_drop", ask_pence: 7000 },
      { listing_id: L2, kind: "new", ask_pence: 11000 },
    ]);
    const snaps = await db.app`select ask_pence from kickbuy.price_snapshots where listing_id = ${L1} order by id`;
    expect(snaps.map((s) => s.ask_pence)).toEqual([8000, 7000]);
  });

  it("keeps a dismissal and doesn't re-alert at the same price", async () => {
    await db.app`
      update kickbuy.opportunities set status = 'dismissed', dismissed_ask_pence = ask_pence,
        status_changed_at = now() - interval '1 second'
      where listing_id = ${L1}
    `;
    await kickioOwner`update public.listings set updated_at = now() where id = ${L1}`;
    const before = await db.app`select count(*)::int as n from kickbuy.alerts`;
    await runScan(db, { trigger: "manual" });
    const [o] = await db.app`select status from kickbuy.opportunities where listing_id = ${L1}`;
    expect(o.status).toBe("dismissed");
    const after = await db.app`select count(*)::int as n from kickbuy.alerts`;
    expect(after[0].n).toBe(before[0].n);
  });

  it("runs a full rescan after settings change", async () => {
    await db.app`update kickbuy.settings set min_discount_pct = 40, updated_at = now()`;
    const r = await runScan(db, { trigger: "manual" });
    expect(r).toMatchObject({ ran: true, kind: "full" });
    const [o2] = await db.app`select status from kickbuy.opportunities where listing_id = ${L2}`;
    expect(o2.status).toBe("new"); // 45% still qualifies
    const [o1] = await db.app`select status from kickbuy.opportunities where listing_id = ${L1}`;
    expect(o1.status).toBe("dismissed"); // 65%, but dismissed at this price
  });
});

async function insert(sql: postgres.Sql, table: string, rows: Record<string, unknown>[]) {
  for (const row of rows) await sql`insert into ${sql(table)} ${sql(row as never)}`;
}

async function seed(sql: postgres.Sql) {
  const [spurs] = await sql`insert into public.teams (name) values ('Tottenham Hotspur') returning id`;
  await sql`insert into public.team_aliases (team_id, alias, alias_norm) values (${spurs.id}, 'Spurs', 'spurs')`;
  await sql`insert into public.exchange_rates values ('GBP', 1, now()), ('EUR', 1.185, now())`;
  const utd = {
    team: "Manchester United", season: "1997-98", shirt_type: "Home", manufacturer: "Umbro", gender: "Mens",
    issue: "Standard Retail Version", special_edition: "Not A Special Edition", sleeves: "Short-Sleeved", signed: "Not Signed",
  };
  await insert(sql, "public.products", [
    { id: P_UTD, ...utd },
    { id: P_ARS, ...utd, team: "Arsenal", season: "2002-04", shirt_type: "Away", manufacturer: "Nike" },
  ]);
  const listing = (id: string, o: Record<string, unknown>) => ({
    id, title: "Shirt", size: "L", condition: "Very Good", status: "active", price_cents: 8000, ...o,
  });
  await insert(sql, "public.listings", [
    listing(L1, { product_id: P_UTD, status: "pending", source: "scrape", source_url: "https://kit.example/p/1" }),
    listing(L2, { product_id: P_UTD, price_cents: 11000 }),
    listing(L3, { product_id: P_UTD, condition: "Mint" }),
    listing(L4, { product_id: P_ARS, price_cents: 6500 }),
    listing(L5, { ...utd, team: "Spurs", season: "2010-11", price_cents: 3000 }),
    listing(L6, { product_id: P_UTD, status: "draft", price_cents: 100 }),
    listing(SOLD, { product_id: P_ARS, status: "sold" }),
  ]);
  const sale = (o: Record<string, unknown>) => ({
    condition: "Very Good", size: "L", source: "cfs", sold_at: new Date("2026-09-01"), price_cents: 12000, ...o,
  });
  await insert(sql, "public.sales_history", [
    sale({ product_id: P_UTD }),
    // L1's own earlier sale (same vendor URL) must be ignored for L1: if it
    // weren't, L1 would be valued at £85 and not qualify.
    sale({ product_id: P_UTD, source_url: "https://kit.example/p/1", price_cents: 8500, sold_at: new Date("2026-09-20") }),
    // Refunded Kickio sale of an Arsenal shirt: excluded.
    sale({ product_id: P_ARS, source: "kickio", listing_id: SOLD, price_cents: 9500, sold_at: new Date("2026-09-15") }),
    sale({ product_id: P_ARS, source: "vfs", price_cents: 7000, sold_at: new Date("2026-08-01") }),
    // Excluded and pending sales are never used.
    sale({ product_id: P_UTD, price_cents: 99900, excluded_at: new Date() }),
    sale({ product_id: P_UTD, price_cents: 99900, review_state: "pending" }),
    // Orphan sale (no product) for Tottenham, matched by alias and attributes.
    sale({ ...utd, team: "Tottenham Hotspur", season: "2010-11", price_cents: 6000 }),
  ]);
  await sql`
    insert into public.orders (listing_id, status, created_at)
    values (${SOLD}, 'cancelled', '2026-09-10'), (${SOLD}, 'refunded', '2026-09-14')
  `;
  // An abandoned checkout before a genuine sale doesn't invalidate it.
  await sql`
    insert into public.sales_history (product_id, listing_id, sold_at, price_cents, condition, size, source)
    values (${P_ARS}, ${L6}, '2026-07-01', 6600, 'Very Good', 'L', 'kickio')
  `;
  await sql`
    insert into public.orders (listing_id, status, created_at)
    values (${L6}, 'cancelled', '2026-06-30'), (${L6}, 'completed', '2026-07-01')
  `;
}
