-- The reference sale can be in a worse condition than the listing (a better
-- shirt for less than a worse one sold for); record which.
alter table kickbuy.opportunities add column if not exists ref_condition text;
