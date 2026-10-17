import "server-only";
import { app } from "../db";

// Alerts older than this are treated as read, so a new user doesn't start
// with a backlog.
const UNREAD_WINDOW = "14 days";

export async function unreadAlertCount(userId: string): Promise<number> {
  const [r] = await app()<{ n: number }[]>`
    select count(*)::int as n from kickbuy.alerts a
    join kickbuy.opportunities o on o.id = a.opportunity_id and o.removed_at is null
    where a.created_at > now() - ${UNREAD_WINDOW}::interval
      and not exists (select 1 from kickbuy.alert_reads r where r.alert_id = a.id and r.user_id = ${userId})
  `;
  return r.n;
}

export type AlertRow = {
  id: string;
  created_at: Date;
  kind: "new" | "price_drop";
  ask_pence: number;
  ref_price_pence: number;
  discount_pct: string;
  opportunity_id: string;
  title: string;
  pre_live: boolean;
  status: string;
  ask_currency: string;
  current_ask_pence: number;
  read: boolean;
};

export async function listAlerts(userId: string, limit = 100): Promise<AlertRow[]> {
  return app()<AlertRow[]>`
    select a.id, a.created_at, a.kind, a.ask_pence, a.ref_price_pence, a.discount_pct, a.opportunity_id,
           o.title, o.pre_live, o.status, o.ask_currency, o.ask_pence as current_ask_pence,
           (a.created_at <= now() - ${UNREAD_WINDOW}::interval
            or exists (select 1 from kickbuy.alert_reads r where r.alert_id = a.id and r.user_id = ${userId})) as read
    from kickbuy.alerts a join kickbuy.opportunities o on o.id = a.opportunity_id and o.removed_at is null
    order by a.created_at desc
    limit ${limit}
  `;
}

export async function markAlertsRead(userId: string, alertIds?: string[]) {
  const sql = app();
  if (alertIds) {
    if (alertIds.length === 0) return;
    await sql`
      insert into kickbuy.alert_reads (alert_id, user_id)
      select id, ${userId} from kickbuy.alerts where id = any(${alertIds}::uuid[])
      on conflict do nothing
    `;
    return;
  }
  await sql`
    insert into kickbuy.alert_reads (alert_id, user_id)
    select id, ${userId} from kickbuy.alerts where created_at > now() - ${UNREAD_WINDOW}::interval
    on conflict do nothing
  `;
}
