import type postgres from "postgres";
import type { Settings } from "./engine/types";

export type AppSettings = Settings & {
  scanIntervalMinutes: number;
  alertsEnabled: boolean;
  updatedAt: Date;
};

type Row = {
  min_discount_pct: string;
  max_sale_age_months: number | null;
  scan_interval_minutes: number;
  require_exact_size: boolean;
  alerts_enabled: boolean;
  sale_sources: string[] | null;
  updated_at: Date;
};

export async function loadSettings(sql: postgres.Sql): Promise<AppSettings> {
  const [r] = await sql<Row[]>`select * from kickbuy.settings where id = 1`;
  if (!r) throw new Error("kickbuy.settings has no row");
  return {
    minDiscountPct: Number(r.min_discount_pct),
    maxSaleAgeMonths: r.max_sale_age_months,
    requireExactSize: r.require_exact_size,
    saleSources: r.sale_sources && r.sale_sources.length > 0 ? r.sale_sources : null,
    scanIntervalMinutes: r.scan_interval_minutes,
    alertsEnabled: r.alerts_enabled,
    updatedAt: r.updated_at,
  };
}
