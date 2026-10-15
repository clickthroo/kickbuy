-- KickBuy read interface on the Kickio database.
--
-- KickBuy never reads Kickio tables directly. It connects as `kickbuy_reader`,
-- which can only SELECT from the views in the `kickbuy` schema below. The
-- views are owned by `postgres`, so they read the underlying RLS-protected
-- tables with owner rights, and they expose only the rows and columns
-- KickBuy needs (no buyer PII, no addresses, no payment data).
--
-- Additive only: this migration never alters a Kickio table.
--
-- The role is created without a password; the password is set separately
-- from a SCRAM-SHA-256 verifier so the plaintext never appears in migration
-- history (see db/README.md).

create schema if not exists kickbuy;
revoke all on schema kickbuy from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kickbuy_reader') then
    create role kickbuy_reader login noinherit;
  end if;
end $$;

alter role kickbuy_reader set default_transaction_read_only = on;
alter role kickbuy_reader set statement_timeout = '30s';
alter role kickbuy_reader set search_path = kickbuy;

-- Football shirts that are, or are about to be, for sale:
--   active / reserved  live on the marketplace (reserved = in someone's checkout)
--   pending            the admin review queue, including approved listings
--                      still in lay-flat photo prep (prep_status 'preparing'
--                      or 'needs_attention')
--
-- Identity attributes prefer the linked product, which is Kickio's canonical
-- shirt identity, and fall back to the listing's own attributes. Most review
-- queue listings have no product yet, so the fallback matters.
create or replace view kickbuy.inventory as
select
  l.id                                              as listing_id,
  l.product_id,
  l.seller_id,
  l.title,
  l.status::text                                    as status,
  l.prep_status,
  l.source,
  l.source_url,
  ss.name                                           as source_name,
  l.is_partner_listing,
  l.price_cents,
  l.raw_price_cents,
  l.currency,
  l.size,
  l.condition,
  coalesce(p.team, l.team)                          as team,
  p.team_id,
  coalesce(p.season, l.season)                      as season,
  coalesce(p.shirt_type, l.shirt_type)              as shirt_type,
  coalesce(l.manufacturer, p.manufacturer)          as manufacturer,
  coalesce(p.gender, l.gender)                      as gender,
  coalesce(p.issue, l.issue)                        as issue,
  coalesce(p.special_edition, l.special_edition)    as special_edition,
  coalesce(p.sleeves, l.sleeves)                    as sleeves,
  coalesce(p.signed, l.signed)                      as signed,
  coalesce(l.boxed_edition, p.boxed_edition)        as boxed_edition,
  coalesce(p.player_name, p.player, l.player_name)  as player_name,
  coalesce(p."number", l."number")                  as shirt_number,
  case when jsonb_typeof(l.images) = 'array' then l.images ->> 0 end as image_url,
  l.created_at,
  l.updated_at
from public.listings l
left join public.products p on p.id = l.product_id and p.deleted_at is null
left join public.scrape_sources ss on ss.id = l.scrape_source_id
where l.deleted_at is null
  and l.status in ('active', 'reserved', 'pending')
  and l.category = 'Football Shirts';

-- Completed sales that are valid price evidence. Same filter Kickio's own
-- price index uses (approved, not excluded, price > 0), plus:
--   - dismissed orphan sales and non-shirt items are left out;
--   - Kickio marketplace sales are left out when the listing's latest paid
--     order was cancelled, refunded (fully or partly), disputed, or charged
--     back. Kickio already deletes the sale on a full refund; this also
--     catches the rest.
-- price_cents is the item price only: no postage, fees or tax.
create or replace view kickbuy.sales as
select
  s.id                                              as sale_id,
  s.product_id,
  s.listing_id,
  s.sold_at,
  s.price_cents,
  s.currency,
  s.condition,
  s.size,
  s.source,
  s.source_url,
  coalesce(s.external_url, s.source_url)            as sale_url,
  coalesce(p.team, s.team)                          as team,
  p.team_id,
  coalesce(p.season, s.season)                      as season,
  coalesce(p.shirt_type, s.shirt_type)              as shirt_type,
  coalesce(s.manufacturer, p.manufacturer)          as manufacturer,
  coalesce(p.gender, s.gender)                      as gender,
  coalesce(p.issue, s.issue)                        as issue,
  coalesce(p.special_edition, s.special_edition)    as special_edition,
  coalesce(p.sleeves, s.sleeves)                    as sleeves,
  coalesce(p.signed, s.signed)                      as signed,
  coalesce(s.boxed_edition, p.boxed_edition)        as boxed_edition,
  coalesce(p.player_name, p.player, s.player_name)  as player_name,
  coalesce(p."number", s."number")                  as shirt_number,
  s.created_at
from public.sales_history s
left join public.products p on p.id = s.product_id and p.deleted_at is null
where s.review_state = 'approved'
  and s.excluded_at is null
  and s.dismissed_at is null
  and s.price_cents > 0
  and coalesce(s.item_kind, 'shirt') = 'shirt'
  and not (
    s.source = 'kickio'
    and s.listing_id is not null
    and coalesce((
      -- The listing's latest order that got as far as payment. An earlier
      -- abandoned checkout doesn't invalidate a later genuine sale.
      select o.status in ('cancelled', 'refunded', 'partially_refunded', 'disputed')
             or o.dispute_status in ('open', 'escalated', 'resolved_refund')
             or exists (select 1 from public.chargebacks c where c.order_id = o.id)
      from public.orders o
      where o.listing_id = s.listing_id
        and o.deleted_at is null
        and o.status <> 'pending_payment'
      order by o.created_at desc
      limit 1
    ), false)
  );

-- Team names and aliases, so "Spurs" and "Tottenham Hotspur" match.
create or replace view kickbuy.team_names as
select t.id as team_id, lower(btrim(t.name)) as name_norm
from public.teams t
where t.deleted_at is null
union
select a.team_id, a.alias_norm
from public.team_aliases a;

-- Kickio's current exchange rates. Kickio keeps only the latest rate per
-- currency; KickBuy records a dated copy on each scan for historical lookups.
create or replace view kickbuy.exchange_rates as
select currency_code, rate_to_gbp, last_updated
from public.exchange_rates;

grant usage on schema kickbuy to kickbuy_reader;
grant select on all tables in schema kickbuy to kickbuy_reader;
alter default privileges in schema kickbuy grant select on tables to kickbuy_reader;
