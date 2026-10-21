-- Kickio sometimes links a sale or listing to the wrong catalogue product: a
-- Classic Football Shirts long-sleeved Beckham shirt was linked to the
-- short-sleeved product, so it looked short-sleeved and valued a short-sleeved
-- listing. When the record and its product disagree on sleeves, version
-- (replica / player), fit, type or season, the link is ignored and the
-- record's own details are used. Same views as 0003 / 0004 otherwise.
create or replace view kickbuy.inventory as
select
  l.id                                              as listing_id,
  p.id                                              as product_id,
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
  l.updated_at,
  l.description
from public.listings l
-- A product link that contradicts the listing (long- vs short-sleeved, replica
-- vs player version...) is wrong; ignore it and use the listing's own details.
left join public.products p on p.id = l.product_id and p.deleted_at is null
  and not (
       lower(l.sleeves) is distinct from lower(p.sleeves) and l.sleeves is not null and p.sleeves is not null
    or lower(l.issue) is distinct from lower(p.issue) and l.issue is not null and p.issue is not null
    or lower(l.gender) is distinct from lower(p.gender) and l.gender is not null and p.gender is not null
    or lower(l.shirt_type) is distinct from lower(p.shirt_type) and l.shirt_type is not null and p.shirt_type is not null
    or l.season is distinct from p.season and l.season is not null and p.season is not null
  )
left join public.scrape_sources ss on ss.id = l.scrape_source_id
where l.deleted_at is null
  and l.status in ('active', 'reserved', 'pending')
  and l.category = 'Football Shirts';

create or replace view kickbuy.sales as
with vanished as (
  -- Sales Kickio inferred because a scraped listing vanished from a sweep.
  select s.id, s.source, date_trunc('day', l.removed_at) as day
  from public.sales_history s
  join public.listings l on l.id = s.listing_id
  where l.removed_reason = 'sweep_vanished' and l.status = 'removed'
), daily as (
  select source, day, count(*) as n from vanished group by source, day
), typical as (
  select source, percentile_cont(0.5) within group (order by n) as median_per_day from daily group by source
), mass_vanished as (
  -- A day on which a shop "sold" far more than usual is a scraper failure,
  -- not a run of sales: more than 5x the shop's median day, and over 100.
  select v.id
  from vanished v
  join daily d on d.source = v.source and d.day = v.day
  join typical t on t.source = v.source
  where d.n > greatest(100, 5 * t.median_per_day)
)
select
  s.id                                              as sale_id,
  p.id                                              as product_id,
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
-- A product link that contradicts the sale (long- vs short-sleeved, replica
-- vs player version...) is wrong; ignore it and use the sale's own details.
left join public.products p on p.id = s.product_id and p.deleted_at is null
  and not (
       lower(s.sleeves) is distinct from lower(p.sleeves) and s.sleeves is not null and p.sleeves is not null
    or lower(s.issue) is distinct from lower(p.issue) and s.issue is not null and p.issue is not null
    or lower(s.gender) is distinct from lower(p.gender) and s.gender is not null and p.gender is not null
    or lower(s.shirt_type) is distinct from lower(p.shirt_type) and s.shirt_type is not null and p.shirt_type is not null
    or s.season is distinct from p.season and s.season is not null and p.season is not null
  )
left join mass_vanished m on m.id = s.id
left join public.listings own on own.id = s.listing_id
where m.id is null
  -- The scraped listing is live on Kickio again, so it never sold.
  and not coalesce(s.source <> 'kickio' and own.deleted_at is null and own.status in ('active', 'reserved', 'pending'), false)
  and s.review_state = 'approved'
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
