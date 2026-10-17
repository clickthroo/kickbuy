-- "Remove" hides an opportunity for good: it never shows in any list, count
-- or alert again, even if its price drops. Scans still keep the row up to
-- date (so the listing isn't re-detected as new), but nothing displays it.
alter table kickbuy.opportunities
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users (id),
  add column if not exists removed_reason text;

create index if not exists opportunities_visible_idx
  on kickbuy.opportunities (status, discount_pct desc) where removed_at is null;
