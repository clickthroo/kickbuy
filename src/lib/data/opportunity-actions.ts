import "server-only";
import { app } from "../db";

// Watch / dismiss / reopen / remove, shared by the web app and the Telegram
// bot. Only KickBuy's own record changes: nothing is ever sent to Kickio.

export const UUID = /^[0-9a-f-]{36}$/i;

const STATUS = { watch: "watching", dismiss: "dismissed", reopen: "new" } as const;
export type StatusAction = keyof typeof STATUS;
export const isStatusAction = (a: string): a is StatusAction => a in STATUS;

// Returns false when nothing changed (expired, already in that state, unknown).
export async function setStatus(userId: string, id: string, action: StatusAction, note: string | null = null) {
  const status = STATUS[action];
  return app().begin(async (tx) => {
    const [before] = await tx<{ status: string; ask_pence: number }[]>`
      select status, ask_pence from kickbuy.opportunities where id = ${id} and removed_at is null for update
    `;
    if (!before || before.status === "expired" || before.status === status) return false;
    await tx`
      update kickbuy.opportunities set
        status = ${status},
        status_changed_at = now(),
        status_changed_by = ${userId},
        dismissed_ask_pence = ${status === "dismissed" ? before.ask_pence : null}
      where id = ${id}
    `;
    await tx`
      insert into kickbuy.user_actions (user_id, action, opportunity_id, detail)
      values (${userId}, ${`opportunity.${action}`}, ${id},
              ${tx.json({ from: before.status, to: status, askPence: before.ask_pence, note })})
    `;
    return true;
  });
}

export async function removeForGood(userId: string, id: string) {
  const sql = app();
  const rows = await sql`
    update kickbuy.opportunities
    set removed_at = now(), removed_by = ${userId}, removed_reason = 'Removed by a person'
    where id = ${id} and removed_at is null
    returning id
  `;
  if (rows.length) {
    await sql`
      insert into kickbuy.user_actions (user_id, action, opportunity_id, detail)
      values (${userId}, 'opportunity.remove', ${id}, ${sql.json({})})
    `;
  }
  return rows.length > 0;
}

export async function restore(userId: string, id: string) {
  const sql = app();
  const rows = await sql`
    update kickbuy.opportunities set removed_at = null, removed_by = null, removed_reason = null
    where id = ${id} and removed_at is not null
    returning id
  `;
  if (rows.length) {
    await sql`
      insert into kickbuy.user_actions (user_id, action, opportunity_id, detail)
      values (${userId}, 'opportunity.restore', ${id}, ${sql.json({})})
    `;
  }
  return rows.length > 0;
}
