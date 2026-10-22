-- Telegram alerts. Each KickBuy user can link one Telegram chat (via a
-- one-time code from Settings) and choose which alerts are sent there.

create table kickbuy.telegram_links (
  user_id              uuid primary key references kickbuy.app_users (user_id) on delete cascade,
  chat_id              bigint unique,                 -- null until linked
  link_code            text unique,                   -- one-time code for /start, while linking
  link_code_expires_at timestamptz,
  linked_at            timestamptz,                   -- only alerts after this are sent
  paused               boolean not null default false,
  -- Preferences. null min discount = same as the app's threshold.
  min_discount_pct     numeric(5, 2) check (min_discount_pct is null or (min_discount_pct > 0 and min_discount_pct < 100)),
  include_needs_check  boolean not null default true, -- low-confidence / stale matches
  live_only            boolean not null default false,
  quiet_from_hour      smallint check (quiet_from_hour between 0 and 23), -- Europe/London
  quiet_to_hour        smallint check (quiet_to_hour between 0 and 23),
  updated_at           timestamptz not null default now()
);

-- One row per alert per user: claimed before sending, so an alert is never
-- sent twice even if two scans overlap.
create table kickbuy.telegram_deliveries (
  alert_id    uuid not null references kickbuy.alerts (id) on delete cascade,
  user_id     uuid not null references kickbuy.app_users (user_id) on delete cascade,
  claimed_at  timestamptz not null default now(),
  sent_at     timestamptz,
  message_id  bigint,
  outcome     text,                                   -- sent | summarised | failed: ...
  primary key (alert_id, user_id)
);
create index telegram_deliveries_claimed_idx on kickbuy.telegram_deliveries (claimed_at desc);

alter table kickbuy.telegram_links enable row level security;
alter table kickbuy.telegram_deliveries enable row level security;
grant select, insert, update, delete on kickbuy.telegram_links, kickbuy.telegram_deliveries to kickbuy_app;
create policy app_all on kickbuy.telegram_links to kickbuy_app using (true) with check (true);
create policy app_all on kickbuy.telegram_deliveries to kickbuy_app using (true) with check (true);
