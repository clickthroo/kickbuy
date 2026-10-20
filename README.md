# KickBuy

Kickio's internal buying-intelligence tool. It watches every Kickio listing,
live and in the review queue, and flags shirts listed well below the last
sale of the same shirt in the same condition, so Kickio can spot buying
opportunities first.

KickBuy is **read-only** towards Kickio: it never approves, rejects, reserves,
buys or edits anything. It reads Kickio's database through a narrow set of
views, and keeps its own records (opportunities, alerts, scan history, who
did what) in a separate database.

## Architecture

```
Browser ──► KickBuy (Next.js on Vercel)          Vercel Cron, every 5 min
              │  auth: Supabase Auth (KickBuy project), password + TOTP, AAL2
              │                                         │
              │        ┌──── scanner (src/lib/scan) ◄───┘  /api/cron/scan
              │        │     matching engine (src/lib/engine)
              ├────────┴──► KickBuy DB  (kickbuy schema, role kickbuy_app)
              └───────────► Kickio DB   (kickbuy views only, role kickbuy_reader, read-only)
```

Same stack and conventions as KickAccount: Next.js 16, React 19, Tailwind 4,
`postgres` over Supabase's transaction pooler, Supabase Auth with mandatory
TOTP. All database access is server-side; no credentials reach the browser.

- **Access.** Invite-only. Every request checks the Supabase session with the
  Auth server, requires a passed TOTP challenge (AAL2), and an active row in
  `kickbuy.app_users`. Roles: `owner` (everything, including settings and
  users), `buyer` (watch/dismiss opportunities, run scans), `viewer`
  (read-only). Owners create invite and reset links on the Users page.
- **Kickio access.** `kickbuy_reader` can only `SELECT` from views in Kickio's
  `kickbuy` schema; every transaction is read-only with a 30s statement
  timeout. See `db/README.md`.
- **Audit.** Sign-ins, settings changes, scans and every watch/dismiss go to
  `kickbuy.user_actions`, which can't be updated or deleted.

## How an opportunity is found

For each listing in scope (live, reserved, or in the review queue). Kickio
Direct stock (Kickio's own house seller account) is excluded: Kickio already
owns it. See `EXCLUDED_SELLER_IDS` in `src/lib/scan/run.ts`.

1. **Identify the shirt** (`src/lib/engine/match.ts`). Kickio's product is its
   canonical shirt identity, so a listing and a sale linked to the same
   product are the same shirt. Most review-queue listings aren't linked to a
   product yet, so KickBuy also matches on structured attributes, never on
   titles or descriptions:

   | Attribute | Rule |
   |---|---|
   | Condition | Exact Kickio grade, always. Unreadable grades ("Excelllent") are never guessed. |
   | Club / country, season, shirt type | Exact (team aliases and season spellings like 97/98 are normalised) |
   | Player / name set, number | Exact, including "no name" |
   | Signed, special edition, boxed edition | Exact (missing = Kickio's default, e.g. "Not Signed") |
   | Manufacturer, gender, version (replica/authentic/match-worn), sleeves | Must agree when both are known; if either is missing, the match is kept at **low** confidence and flagged for manual review |
   | Size | Same size preferred; other adult sizes used at lower confidence when there's no same-size sale; optionally required. Kids' and adult sizes are never mixed. |

   Confidence: **high** = same Kickio product and same size; **medium** =
   attributes all match (or same product, different size); **low** = an
   attribute had to be assumed. Low-confidence and stale matches are marked
   "review".

2. **Find the reference sale** (`src/lib/engine/evaluate.ts`): valid sales
   only (approved, not excluded, not refunded/disputed; see `db/README.md`),
   never the listing's own earlier sale (same listing or same vendor URL),
   from the enabled sales sources. Among the best-matching comparables, the
   **most recent** sale is the reference. Sales older than the maximum age are
   used only when nothing fresher exists, and are marked stale. Foreign
   currency is converted at the rate KickBuy recorded nearest the sale date.

3. **Discount** = (last sold − asking) ÷ last sold × 100. The listing is an
   opportunity at or above the threshold (default 20%). The last three
   comparable sales and their median are shown for context only.

No comparable sale → "insufficient sales data", never an invented value.

## Scanning

`src/lib/scan/run.ts`, triggered by Vercel Cron every 5 minutes; it scans
when the interval in Settings (default 15 min) has passed.

- **Full scan** of all ~16k listings: first run, then at least daily, and
  after any settings change.
- **Incremental scan:** listings changed since the last scan, listings that
  a newly recorded sale could value, and every open opportunity, so sold,
  removed or repriced listings expire promptly.
- Reads are keyset-paginated. Sales (~30k narrow rows) are indexed in server
  memory per run, never in the browser. One scan at a time (enforced by a
  unique index); a scan that dies is marked failed after 15 minutes.
- Every scan is logged in `kickbuy.scan_runs` with counts, duration and any
  error (Scans page).

Opportunity statuses: **New**, **Watching**, **Dismissed** (stays dismissed
unless the price drops below the dismissed price), **Expired** (the listing
left the inventory or no longer qualifies; comes back as New if it
qualifies again). The expiry reason says why: sold, removed, deleted or
cancelled on Kickio, back in draft, or no longer below the reference
(`kickbuy.listing_states` view).

**Remove** (the × on each row, or "Remove permanently" on the detail page)
hides an opportunity for good: it never appears in any list, total or alert
again, even if its price drops. Scans keep the row up to date so the listing
isn't re-detected as new. Restore from the detail page if needed.

**Sizes and condition** (Settings): by default only adult M, L and XL
(a listing offering several sizes counts if any is one of these) in Good
condition or better. Shops can be left out too (by default Classic Football Shirts, Vintage
Football Shirts and Cult Football). Listings outside these aren't valued;
their open opportunities expire, and come back if the settings are widened.

Only Kickio's **Football Shirts** category is scanned (`kickbuy.inventory`
view); shorts, jackets, polos and other categories never become
opportunities. A listing that is moved out of Football Shirts on Kickio
is removed from KickBuy automatically at the next scan, as if someone had
pressed Remove. Some items Kickio files as Football Shirts
are something else (shorts, kits, training and leisure wear, fan tees, polos,
jackets, rugby shirts), often with a generated "... Home Shirt" title. Each
listing is checked against the shop's product URL and Classic Football
Shirts' product code, Kickio's shirt type and the listing description; any one
saying it isn't a match shirt keeps it out, and removes an opportunity already
raised for it (`src/lib/engine/scope.ts`). Price changes are kept in `kickbuy.price_snapshots`.

**Alerts** are in-app, once per listing and qualifying price; a further price
drop alerts again (`unique (listing_id, ask_pence)` plus a "below the lowest
price already alerted" rule).

## Development

```sh
cp .env.example .env.local   # fill in
npm install
npm run dev
npm test                     # matching, valuation and lifecycle rules
npm run typecheck
npm run lint
```

Integration test: runs both migrations against a stub of Kickio's tables on a
real Postgres, connects as the real roles (and checks the reader can't write),
then runs full and incremental scans:

```sh
KICKBUY_TEST_PG=postgres://postgres@localhost:5432/postgres npm run test:integration
```

## Setting up

1. Apply the migrations in `db/kickio/` to Kickio and those in
   `db/kickbuy/` to the KickBuy project, in order; set both role
   passwords (`db/README.md`).
2. Create the Vercel project with the variables in `.env.example`
   (`CRON_SECRET` enables the scheduled scan).
3. First owner: `node scripts/bootstrap-owner.mjs you@example.com` (needs the
   env vars it lists) prints a one-time invite link. If you can't reach the
   databases from your machine, set `SETUP_TOKEN` in Vercel and use
   `/api/setup?token=…&action=check|owner&email=…|scan` on the deployment
   (see `src/app/api/setup/route.ts`), then remove `SETUP_TOKEN`.
4. Sign in, then run the first scan from the dashboard.
