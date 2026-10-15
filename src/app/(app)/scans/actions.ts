"use server";
import { revalidatePath } from "next/cache";
import { audit, requireUser } from "@/lib/auth";
import { scanNow } from "@/lib/scan";

export type ScanActionResult = { message: string; ok: boolean } | null;

export async function runScanAction(_prev: ScanActionResult, form: FormData): Promise<ScanActionResult> {
  const full = form.get("full") === "1";
  const user = await requireUser(full ? "owner" : "buyer");
  await audit(user.id, full ? "scan.run_full" : "scan.run", {});
  try {
    const r = await scanNow({ trigger: "manual", userId: user.id, forceFull: full });
    revalidatePath("/", "layout");
    if (!r.ran) return { ok: false, message: r.reason };
    const s = r.stats;
    return {
      ok: true,
      message: `${r.kind === "full" ? "Full" : "Incremental"} scan: ${s.listingsScanned.toLocaleString("en-GB")} listings, ${s.opportunitiesNew} new, ${s.opportunitiesExpired} expired.`,
    };
  } catch (e) {
    revalidatePath("/scans");
    return { ok: false, message: `Scan failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
