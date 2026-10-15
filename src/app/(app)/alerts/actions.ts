"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { markAlertsRead } from "@/lib/data/alerts";

export async function markAllRead() {
  const user = await requireUser();
  await markAlertsRead(user.id);
  revalidatePath("/", "layout");
}
