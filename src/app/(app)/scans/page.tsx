import { RunScanButton } from "@/components/run-scan-button";
import { hasRole, requireUser } from "@/lib/auth";
import { listScanRuns } from "@/lib/data/scans";
import { dateTime } from "@/lib/format";
import { loadSettings } from "@/lib/settings";
import { app } from "@/lib/db";

export default async function ScansPage() {
  const user = await requireUser();
  const [runs, settings] = await Promise.all([listScanRuns(), loadSettings(app())]);
  const n = (v: number) => v.toLocaleString("en-GB");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Scans</h1>
          <p className="max-w-3xl text-sm text-muted">
            Scans run every {settings.scanIntervalMinutes} minutes. Each one re-checks listings that changed, listings a
            newly recorded sale could value, and every open opportunity. A full scan of the whole inventory runs at least
            daily and after any settings change.
          </p>
        </div>
        {hasRole(user, "buyer") && (
          <div className="flex flex-wrap gap-2">
            <RunScanButton />
            {hasRole(user, "owner") && <RunScanButton full />}
          </div>
        )}
      </div>
      <ul className="space-y-3 md:hidden">
        {runs.map((r) => (
          <li key={r.id} className="card p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{dateTime(r.started_at)}</p>
                <p className="text-xs text-muted">
                  {r.kind} · {r.trigger === "cron" ? "scheduled" : (r.email ?? "manual")}
                  {r.duration_ms !== null && ` · ${(r.duration_ms / 1000).toFixed(1)}s`}
                </p>
              </div>
              <span
                className={r.status === "succeeded" ? "badge badge-good" : r.status === "failed" ? "badge badge-warn" : "badge"}
              >
                {r.status}
              </span>
            </div>
            {r.error && <p className="mt-2 text-xs text-warn">{r.error}</p>}
            <dl className="mt-2 grid grid-cols-4 gap-2 rounded bg-background p-2 text-center">
              {(
                [
                  ["Listings", r.listings_scanned],
                  ["Priced", r.matched],
                  ["New", r.opportunities_new],
                  ["Alerts", r.alerts_created],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[0.65rem] uppercase tracking-wide text-muted">{k}</dt>
                  <dd className="tabular-nums">{n(v)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted">
              {n(r.insufficient_data)} no sales data · {n(r.unmatchable)} can&apos;t match · {n(r.opportunities_expired)}{" "}
              expired
            </p>
          </li>
        ))}
        {runs.length === 0 && <li className="card p-6 text-sm text-muted">No scans yet.</li>}
      </ul>
      <div className="card hidden overflow-x-auto md:block">
        <table className="table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Kind</th>
              <th>Result</th>
              <th className="num">Listings</th>
              <th className="num">Priced</th>
              <th className="num">No sales data</th>
              <th className="num">Can&apos;t match</th>
              <th className="num">New</th>
              <th className="num">Expired</th>
              <th className="num">Alerts</th>
              <th className="num">Time</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap">
                  {dateTime(r.started_at)}
                  <div className="text-xs text-muted">{r.trigger === "cron" ? "scheduled" : (r.email ?? "manual")}</div>
                </td>
                <td>{r.kind}</td>
                <td className="max-w-xs">
                  <span
                    className={
                      r.status === "succeeded" ? "badge badge-good" : r.status === "failed" ? "badge badge-warn" : "badge"
                    }
                  >
                    {r.status}
                  </span>
                  {r.error && <p className="mt-1 break-words text-xs text-warn">{r.error}</p>}
                </td>
                <td className="num">{n(r.listings_scanned)}</td>
                <td className="num">{n(r.matched)}</td>
                <td className="num">{n(r.insufficient_data)}</td>
                <td className="num">{n(r.unmatchable)}</td>
                <td className="num">{n(r.opportunities_new)}</td>
                <td className="num">{n(r.opportunities_expired)}</td>
                <td className="num">{n(r.alerts_created)}</td>
                <td className="num">{r.duration_ms === null ? "—" : `${(r.duration_ms / 1000).toFixed(1)}s`}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={11} className="text-muted">
                  No scans yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
