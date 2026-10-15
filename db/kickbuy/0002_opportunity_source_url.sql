-- The listing's source product page (e.g. the shop it was scraped from), so
-- buyers can open the original listing from the dashboard. Null for listings
-- created directly on Kickio.
alter table kickbuy.opportunities add column if not exists source_url text;
