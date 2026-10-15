-- A minimal stand-in for the Kickio tables that db/kickio/0001_*.sql reads,
-- with the same column names and types. Used only by the integration test.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create type public.listing_status as enum ('draft', 'active', 'sold', 'cancelled', 'removed', 'pending', 'reserved');
create type public.order_status as enum ('pending_payment', 'paid', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed', 'partially_refunded');
create type public.order_dispute_status as enum ('none', 'open', 'escalated', 'resolved_refund', 'resolved_keep');

create table public.teams (id uuid primary key default gen_random_uuid(), name text not null, deleted_at timestamptz);
create table public.team_aliases (id uuid primary key default gen_random_uuid(), team_id uuid not null, alias text, alias_norm text not null);
create table public.scrape_sources (id uuid primary key default gen_random_uuid(), name text not null);
create table public.products (
  id uuid primary key default gen_random_uuid(), deleted_at timestamptz, team text, team_id uuid, season text,
  shirt_type text, manufacturer text, gender text, issue text, special_edition text, sleeves text, signed text,
  boxed_edition text, player_name text, player text, "number" text
);
create table public.listings (
  id uuid primary key default gen_random_uuid(), seller_id uuid not null default gen_random_uuid(), product_id uuid,
  title text not null, size text, condition text, price_cents int not null, raw_price_cents int,
  currency text not null default 'GBP', images jsonb not null default '[]', status public.listing_status not null,
  prep_status text, source text, source_url text, scrape_source_id uuid, is_partner_listing boolean not null default false,
  category text not null default 'Football Shirts', team text, season text, shirt_type text, manufacturer text,
  gender text, issue text, special_edition text, sleeves text, signed text, boxed_edition text, player_name text,
  "number" text, created_at timestamptz not null default '2026-10-01', updated_at timestamptz not null default '2026-10-01',
  deleted_at timestamptz
);
create table public.sales_history (
  id uuid primary key default gen_random_uuid(), product_id uuid, listing_id uuid, sold_at timestamptz not null,
  price_cents int not null, currency text not null default 'GBP', condition text, size text, source text not null,
  created_at timestamptz not null default '2026-10-01', team text, season text, shirt_type text, manufacturer text,
  gender text, issue text, special_edition text, sleeves text, boxed_edition text, signed text, player_name text,
  "number" text, external_url text, source_url text, dismissed_at timestamptz, excluded_at timestamptz,
  item_kind text, review_state text not null default 'approved', reviewed_at timestamptz
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null, status public.order_status not null,
  dispute_status public.order_dispute_status not null default 'none', deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.chargebacks (id uuid primary key default gen_random_uuid(), order_id uuid not null);
create table public.exchange_rates (currency_code text primary key, rate_to_gbp numeric not null, last_updated timestamptz not null);
