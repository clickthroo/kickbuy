-- Kickio infers a sale when a scraped listing vanishes from a sweep
-- (removed_reason 'sweep_vanished'). When a shop's scraper fails, thousands of
-- listings vanish at once and every one becomes a "sale" (Vintage Football
-- Shirts, 18-25 Aug 2026: ~1,000 a day against a normal ~20). Those aren't
-- price evidence. Nor is a "sale" whose scraped listing is live on Kickio
-- again (a relisted page reuses the same listing row).
-- Same view as 0001 with these two filters added. Additive only.
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
