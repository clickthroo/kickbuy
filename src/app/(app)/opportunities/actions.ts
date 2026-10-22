"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isStatusAction, removeForGood, restore, setStatus, UUID } from "@/lib/data/opportunity-actions";

// Watch, dismiss or reopen. Only changes KickBuy's own record of the
// opportunity: nothing is ever sent to Kickio.
export async function setOpportunityStatus(form: FormData) {
  const user = await requireUser("buyer");
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  if (!UUID.test(id) || !isStatusAction(action)) return;
  await setStatus(user.id, id, action, note);
  revalidatePath("/", "layout");
}

// Remove an opportunity for good: it disappears from every list, total and
// alert, and never comes back (even if the price drops). Restore undoes it.
export async function removeOpportunity(form: FormData) {
  const user = await requireUser("buyer");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  await removeForGood(user.id, id);
  revalidatePath("/", "layout");
  if (form.get("from") === "detail") redirect("/");
}

export async function restoreOpportunity(form: FormData) {
  const user = await requireUser("buyer");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  await restore(user.id, id);
  revalidatePath("/", "layout");
}
