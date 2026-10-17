"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { app } from "@/lib/db";

const UUID = /^[0-9a-f-]{36}$/i;
const ACTIONS = {
  watch: "watching",
  dismiss: "dismissed",
  reopen: "new",
} as const;

// Watch, dismiss or reopen. Only changes KickBuy's own record of the
// opportunity: nothing is ever sent to Kickio.
export async function setOpportunityStatus(form: FormData) {
  const user = await requireUser("buyer");
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "") as keyof typeof ACTIONS;
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  if (!UUID.test(id) || !(action in ACTIONS)) return;
  const status = ACTIONS[action];

  const sql = app();
  await sql.begin(async (tx) => {
    const [before] = await tx<{ status: string; ask_pence: number }[]>`
      select status, ask_pence from kickbuy.opportunities where id = ${id} for update
    `;
    if (!before || before.status === "expired" || before.status === status) return;
    await tx`
      update kickbuy.opportunities set
        status = ${status},
        status_changed_at = now(),
        status_changed_by = ${user.id},
        dismissed_ask_pence = ${status === "dismissed" ? before.ask_pence : null}
      where id = ${id}
    `;
    await tx`
      insert into kickbuy.user_actions (user_id, action, opportunity_id, detail)
      values (${user.id}, ${`opportunity.${action}`}, ${id},
              ${tx.json({ from: before.status, to: status, askPence: before.ask_pence, note })})
    `;
  });
  revalidatePath("/", "layout");
}

// Remove an opportunity for good: it disappears from every list, total and
// alert, and never comes back (even if the price drops). Restore undoes it.
export async function removeOpportunity(form: FormData) {
  const user = await requireUser("buyer");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  const sql = app();
  const rows = await sql`
    update kickbuy.opportunities
    set removed_at = now(), removed_by = ${user.id}, removed_reason = 'Removed by a person'
    where id = ${id} and removed_at is null
    returning id
  `;
  if (rows.length) {
    await sql`
      insert into kickbuy.user_actions (user_id, action, opportunity_id, detail)
      values (${user.id}, 'opportunity.remove', ${id}, ${sql.json({})})
    `;
  }
  revalidatePath("/", "layout");
  if (form.get("from") === "detail") redirect("/");
}

export async function restoreOpportunity(form: FormData) {
  const user = await requireUser("buyer");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  const sql = app();
  const rows = await sql`
    update kickbuy.opportunities set removed_at = null, removed_by = null, removed_reason = null
    where id = ${id} and removed_at is not null
    returning id
  `;
  if (rows.length) {
    await sql`
      insert into kickbuy.user_actions (user_id, action, opportunity_id, detail)
      values (${user.id}, 'opportunity.restore', ${id}, ${sql.json({})})
    `;
  }
  revalidatePath("/", "layout");
}
