import "server-only";
import { app } from "../db";

export type ScanRunRow = {
  id: string;
  kind: "full" | "incremental";
  trigger: "cron" | "manual";
  email: string | null;
  status: "running" | "succeeded" | "failed";
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  listings_scanned: number;
  sales_loaded: number;
  matched: number;
  insufficient_data: number;
  unmatchable: number;
  opportunities_new: number;
  opportunities_updated: number;
  opportunities_expired: number;
  alerts_created: number;
  error: string | null;
};

export async function listScanRuns(limit = 100): Promise<ScanRunRow[]> {
  return app()<ScanRunRow[]>`
    select r.id, r.kind, r.trigger, u.email, r.status, r.started_at, r.finished_at, r.duration_ms,
           r.listings_scanned, r.sales_loaded, r.matched, r.insufficient_data, r.unmatchable,
           r.opportunities_new, r.opportunities_updated, r.opportunities_expired, r.alerts_created, r.error
    from kickbuy.scan_runs r left join kickbuy.app_users u on u.user_id = r.triggered_by
    order by r.started_at desc
    limit ${limit}
  `;
}
