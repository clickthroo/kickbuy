"use server";
import { revalidatePath } from "next/cache";
import { audit, requireUser } from "@/lib/auth";
import { app } from "@/lib/db";
import { CONDITIONS } from "@/lib/engine/normalise";
import { LISTING_SIZES } from "@/lib/engine/scope";

export type SettingsResult = { ok: boolean; message: string } | null;

export async function saveSettings(_prev: SettingsResult, form: FormData): Promise<SettingsResult> {
  const user = await requireUser("owner");
  const minDiscount = Number(form.get("min_discount_pct"));
  const maxAgeRaw = String(form.get("max_sale_age_months") ?? "");
  const maxAge = maxAgeRaw === "none" ? null : Number(maxAgeRaw);
  const interval = Number(form.get("scan_interval_minutes"));
  const exactSize = form.get("require_exact_size") === "on";
  const alerts = form.get("alerts_enabled") === "on";
  const sources = form.getAll("sale_sources").map(String).filter((s) => /^[a-z0-9_-]{1,40}$/i.test(s));
  const allSources = form.get("all_sources") === "on";
  const sizes = form.getAll("listing_sizes").map(String).filter((s) => (LISTING_SIZES as readonly string[]).includes(s));
  const allSizes = form.get("all_sizes") === "on";
  const worstRaw = String(form.get("worst_condition") ?? "any");
  const worst = (CONDITIONS as readonly string[]).includes(worstRaw) ? worstRaw : null;
  // Every shop the form showed, less the ticked ones, is excluded.
  const shopName = (v: FormDataEntryValue) => String(v).trim().slice(0, 100);
  const included = new Set(form.getAll("listing_shops").map(shopName));
  const excludedShops = [...new Set(form.getAll("listing_shops_known").map(shopName))].filter((s) => s && !included.has(s));

  if (!(minDiscount >= 1 && minDiscount <= 95)) return { ok: false, message: "Discount threshold must be 1–95%." };
  if (maxAge !== null && !(Number.isInteger(maxAge) && maxAge >= 1 && maxAge <= 120))
    return { ok: false, message: "Choose a maximum sale age." };
  if (![5, 15, 30, 60, 180, 1440].includes(interval)) return { ok: false, message: "Choose a scan frequency." };
  if (!allSources && sources.length === 0) return { ok: false, message: "Choose at least one sales source." };
  if (!allSizes && sizes.length === 0) return { ok: false, message: "Choose at least one size." };

  const [before] = await app()`select * from kickbuy.settings where id = 1`;
  const [after] = await app()`
    update kickbuy.settings set
      min_discount_pct = ${minDiscount}, max_sale_age_months = ${maxAge}, scan_interval_minutes = ${interval},
      require_exact_size = ${exactSize}, alerts_enabled = ${alerts},
      sale_sources = ${allSources ? null : sources}, listing_sizes = ${allSizes ? null : sizes},
      worst_condition = ${worst}, excluded_listing_sources = ${excludedShops},
      updated_at = now(), updated_by = ${user.id}
    where id = 1
    returning *
  `;
  await audit(user.id, "settings.update", { before, after });
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. The next scan will be a full rescan with these settings." };
}
