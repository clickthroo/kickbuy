-- Which listings KickBuy values at all: adult sizes to include and the worst
-- condition to include. null = no restriction. Changing either forces a full
-- rescan, which expires opportunities that fall outside them.
alter table kickbuy.settings
  add column listing_sizes text[] default '{M,L,XL}',
  add column worst_condition text default 'Good'
    check (worst_condition in ('Brand New (With Tags)', 'Mint', 'Very Good', 'Good', 'Fair', 'Needs Attention'));

-- Apply to the existing scan results at the next scan.
update kickbuy.settings set updated_at = now() where id = 1;
