-- Adds the listing description to kickbuy.inventory. Kickio files some items
-- that aren't a football shirt under Football Shirts with a generated "...
-- Shirt" title; the description (often the shop's own text) still says what
-- the item is: "fan shirt", "training top", "1/4 zip"...
-- Same view as 0001 with one column appended. Additive only.
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
  l.updated_at,
  l.description
from public.listings l
left join public.products p on p.id = l.product_id and p.deleted_at is null
left join public.scrape_sources ss on ss.id = l.scrape_source_id
where l.deleted_at is null
  and l.status in ('active', 'reserved', 'pending')
  and l.category = 'Football Shirts';
