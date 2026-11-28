-- Reading eBay and Vinted pages from KickBuy didn't work (both refuse
-- requests from cloud servers). Kickio keeps the shop's own title instead,
-- read through the inventory view as source_title.
drop table if exists kickbuy.source_checks;
