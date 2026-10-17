-- Why a listing left KickBuy's scope. When an opportunity's listing drops out
-- of kickbuy.inventory, KickBuy looks it up here to tell "sold" from
-- "removed" from "moved out of Football Shirts" (which hides the opportunity
-- for good). Status and category only: no prices, sellers or descriptions.
-- Additive only: never alters a Kickio table.
create or replace view kickbuy.listing_states as
select
  l.id            as listing_id,
  l.status::text  as status,
  l.category,
  l.deleted_at is not null as deleted
from public.listings l;

grant select on kickbuy.listing_states to kickbuy_reader;
