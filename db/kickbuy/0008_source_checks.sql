-- What the shop's own listing page says, for opportunities whose source URL
-- is an opaque item number (eBay, Vinted). Kickio keeps neither the shop's
-- title nor whether the listing has ended, and both matter: a "Home Shirt"
-- in Kickio can be a training top on eBay.
create table kickbuy.source_checks (
  listing_id uuid primary key,
  source_url text not null,
  title text,
  ended boolean not null default false,
  not_shirt text, -- why the title says it isn't a football shirt, if it does
  error text,     -- the page couldn't be read (blocked, timed out); retried later
  checked_at timestamptz not null default now()
);

alter table kickbuy.source_checks enable row level security;
grant select, insert, update, delete on kickbuy.source_checks to kickbuy_app;
create policy app_all on kickbuy.source_checks to kickbuy_app using (true) with check (true);
