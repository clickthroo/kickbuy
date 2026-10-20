-- Shops and sellers whose listings KickBuy ignores (matched on Kickio's scrape
-- source name). Their opportunities expire, and come back if re-included.
alter table kickbuy.settings
  add column excluded_listing_sources text[] not null default '{}';

update kickbuy.settings
set excluded_listing_sources = '{Classic Football Shirts,Vintage Football Shirts,Cult Football}', updated_at = now()
where id = 1;
