-- KickBuy's own database (a separate Supabase project).
--
-- Supabase Auth handles identities and MFA. Everything else lives in the
-- `kickbuy` schema, which is not exposed through the Supabase Data API: the
-- app reads and writes it server-side over a direct Postgres connection.
-- Nothing here ever writes back to Kickio.

create schema if not exists kickbuy;
revoke all on schema kickbuy from public, anon, authenticated;

-- Who may use KickBuy. Signing in to Supabase Auth is not enough: a user must
-- also have an active row here.
--   owner   everything, including settings and users
--   buyer   watch / dismiss opportunities, run scans
--   viewer  read-only
create table kickbuy.app_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  role        text not null check (role in ('owner', 'buyer', 'viewer')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id)
);

-- One row of configuration. Changing a matching setting forces the next scan
-- to be a full rescan.
create table kickbuy.settings (
  id                     smallint primary key default 1 check (id = 1),
  min_discount_pct       numeric(5, 2) not null default 20 check (min_discount_pct > 0 and min_discount_pct < 100),
  max_sale_age_months    integer default 12 check (max_sale_age_months is null or max_sale_age_months > 0),
  scan_interval_minutes  integer not null default 15 check (scan_interval_minutes between 5 and 1440),
  require_exact_size     boolean not null default false,
  alerts_enabled         boolean not null default true,
  -- null = every sales_history source; otherwise only these (e.g. {kickio}).
  sale_sources           text[],
  updated_at             timestamptz not null default now(),
  updated_by             uuid references auth.users (id)
);
insert into kickbuy.settings (id) values (1);

-- One row per scan. A partial unique index means only one scan runs at once.
create table kickbuy.scan_runs (
  id                      uuid primary key default gen_random_uuid(),
  kind                    text not null check (kind in ('full', 'incremental')),
  trigger                 text not null check (trigger in ('cron', 'manual')),
  triggered_by            uuid references auth.users (id),
  status                  text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  -- Kickio's clock when the scan started; the next incremental scan reads
  -- listings changed after this.
  kickio_watermark        timestamptz,
  settings                jsonb not null,
  listings_scanned        integer not null default 0,
  sales_loaded            integer not null default 0,
  matched                 integer not null default 0,
  insufficient_data       integer not null default 0,
  unmatchable             integer not null default 0,
  opportunities_new       integer not null default 0,
  opportunities_updated   integer not null default 0,
  opportunities_expired   integer not null default 0,
  alerts_created          integer not null default 0,
  duration_ms             integer,
  error                   text
);
create unique index scan_runs_one_running on kickbuy.scan_runs ((true)) where status = 'running';
create index scan_runs_started_idx on kickbuy.scan_runs (started_at desc);

-- A listing that is (or was) priced below its reference sale. One row per
-- listing; re-evaluated on every scan that touches the listing.
create table kickbuy.opportunities (
  id                    uuid primary key default gen_random_uuid(),
  listing_id            uuid not null unique,
  status                text not null default 'new' check (status in ('new', 'watching', 'dismissed', 'expired')),
  -- Listing, as last seen.
  listing_status        text not null,
  prep_status           text,
  pre_live              boolean not null,
  title                 text not null,
  product_id            uuid,
  team                  text,
  season                text,
  shirt_type            text,
  manufacturer          text,
  player_name           text,
  size                  text,
  condition             text not null,
  image_url             text,
  source_name           text,
  listed_at             timestamptz not null,
  ask_pence             integer not null,
  ask_currency          text not null,
  -- Reference sale: the most recent valid comparable sale.
  ref_sale_id           uuid not null,
  ref_price_pence       integer not null,       -- converted to the listing currency
  ref_original_pence    integer not null,       -- as recorded
  ref_currency          text not null,
  ref_fx_rate           numeric(12, 6),         -- units of ref_currency per 1 GBP, when converted
  ref_sold_at           timestamptz not null,
  ref_source            text not null,
  ref_url               text,
  ref_size              text,
  ref_stale             boolean not null default false,
  discount_pct          numeric(5, 2) not null,
  saving_pence          integer not null,
  confidence            text not null check (confidence in ('high', 'medium', 'low')),
  needs_review          boolean not null,
  match_notes           text[] not null default '{}',
  -- Context only, never used for the discount.
  recent_sales          jsonb not null default '[]'::jsonb,
  median_pence          integer,
  comparable_count      integer not null default 0,
  qualifies             boolean not null default true,
  first_detected_at     timestamptz not null default now(),
  last_evaluated_at     timestamptz not null default now(),
  last_changed_at       timestamptz not null default now(),
  expired_at            timestamptz,
  expired_reason        text,
  -- Status set by a person; kept so a re-qualifying listing can be reopened.
  status_changed_at     timestamptz,
  status_changed_by     uuid references auth.users (id),
  dismissed_ask_pence   integer
);
create index opportunities_status_idx on kickbuy.opportunities (status, discount_pct desc);
create index opportunities_saving_idx on kickbuy.opportunities (saving_pence desc);
create index opportunities_listed_idx on kickbuy.opportunities (listed_at desc);
create index opportunities_team_idx on kickbuy.opportunities (lower(team));

-- Price and reference history per listing. Written only when something
-- changes (price, status, reference sale), so it stays small.
create table kickbuy.price_snapshots (
  id               bigint generated always as identity primary key,
  listing_id       uuid not null,
  observed_at      timestamptz not null default now(),
  scan_run_id      uuid references kickbuy.scan_runs (id),
  listing_status   text not null,
  ask_pence        integer not null,
  ref_sale_id      uuid,
  ref_price_pence  integer,
  discount_pct     numeric(5, 2),
  qualifies        boolean not null
);
create index price_snapshots_listing_idx on kickbuy.price_snapshots (listing_id, observed_at desc);

-- In-app notifications. One alert per listing per qualifying price: the
-- unique key stops repeats, and the scanner only alerts again when the price
-- drops below the lowest price already alerted.
create table kickbuy.alerts (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references kickbuy.opportunities (id) on delete cascade,
  listing_id      uuid not null,
  ask_pence       integer not null,
  ref_price_pence integer not null,
  discount_pct    numeric(5, 2) not null,
  kind            text not null check (kind in ('new', 'price_drop')),
  scan_run_id     uuid references kickbuy.scan_runs (id),
  created_at      timestamptz not null default now(),
  unique (listing_id, ask_pence)
);
create index alerts_created_idx on kickbuy.alerts (created_at desc);

create table kickbuy.alert_reads (
  alert_id  uuid not null references kickbuy.alerts (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (alert_id, user_id)
);

-- Everything people do: watch / dismiss / reopen, settings, scans, users,
-- sign-ins. Append-only.
create table kickbuy.user_actions (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  user_id         uuid references auth.users (id),
  action          text not null,
  opportunity_id  uuid references kickbuy.opportunities (id) on delete set null,
  detail          jsonb not null default '{}'::jsonb
);
create index user_actions_opportunity_idx on kickbuy.user_actions (opportunity_id, at desc);
create index user_actions_at_idx on kickbuy.user_actions (at desc);

-- Dated copies of Kickio's exchange rates, so a sale can be converted at the
-- rate recorded nearest its sale date.
create table kickbuy.fx_rates (
  currency_code  text not null,
  rate_date      date not null,
  rate_to_gbp    numeric(12, 6) not null check (rate_to_gbp > 0),  -- units per 1 GBP
  primary key (currency_code, rate_date)
);

create function kickbuy.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

create trigger user_actions_immutable before update or delete on kickbuy.user_actions
  for each row execute function kickbuy.forbid_change();
create trigger price_snapshots_immutable before update or delete on kickbuy.price_snapshots
  for each row execute function kickbuy.forbid_change();

-- Belt and braces: RLS on with no Data API policies, so anon/authenticated
-- see nothing even if the schema were ever exposed.
alter table kickbuy.app_users enable row level security;
alter table kickbuy.settings enable row level security;
alter table kickbuy.scan_runs enable row level security;
alter table kickbuy.opportunities enable row level security;
alter table kickbuy.price_snapshots enable row level security;
alter table kickbuy.alerts enable row level security;
alter table kickbuy.alert_reads enable row level security;
alter table kickbuy.user_actions enable row level security;
alter table kickbuy.fx_rates enable row level security;

-- The app's own login role: read/write on kickbuy tables, no access to
-- anything else. Password set from a SCRAM verifier (db/README.md).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kickbuy_app') then
    create role kickbuy_app login noinherit;
  end if;
end $$;
alter role kickbuy_app set statement_timeout = '60s';
alter role kickbuy_app set search_path = kickbuy;

grant usage on schema kickbuy to kickbuy_app;
grant select, insert, update on all tables in schema kickbuy to kickbuy_app;
grant delete on kickbuy.alert_reads to kickbuy_app;
grant usage on all sequences in schema kickbuy to kickbuy_app;

do $$
declare t text;
begin
  foreach t in array array['app_users', 'settings', 'scan_runs', 'opportunities', 'price_snapshots',
                           'alerts', 'alert_reads', 'user_actions', 'fx_rates'] loop
    execute format('create policy app_all on kickbuy.%I to kickbuy_app using (true) with check (true)', t);
  end loop;
end $$;
