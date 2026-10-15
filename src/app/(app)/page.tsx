import Link from "next/link";
import { RunScanButton } from "@/components/run-scan-button";
import { FilterBar } from "@/components/filter-bar";
import { OpportunityTable } from "@/components/opportunity-table";
import { hasRole, requireUser } from "@/lib/auth";
import { dashboardSummary, listOpportunities, PAGE_SIZE, refSources } from "@/lib/data/opportunities";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { ago, money } from "@/lib/format";

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const f = parseFilters(await searchParams);
  const [summary, preLive, list, sources] = await Promise.all([
    dashboardSummary(),
    f.listing === "live" ? null : listOpportunities({ ...f, page: 1 }, { preLiveOnly: true, limit: 10 }),
    listOpportunities(f),
    refSources(),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const last = summary.lastRun;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Buying opportunities</h1>
          <p className="text-sm text-muted">
            Kickio listings priced below the last sale of the same shirt in the same condition. Read-only: KickBuy
            never changes a listing.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          {hasRole(user, "buyer") && <RunScanButton />}
          <span className="text-xs text-muted">
            {summary.running
              ? `Scan running (started ${ago(summary.running.started_at)})`
              : last
                ? `Last scan ${ago(last.started_at)} · ${last.status === "failed" ? "failed" : "complete"}`
                : "No scans yet"}
            {last?.status === "failed" && (
              <>
                {" · "}
                <Link href="/scans" className="text-warn underline">
                  see error
                </Link>
              </>
            )}
          </span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Open opportunities" value={summary.openCount.toLocaleString("en-GB")} />
        <Kpi label="Potential savings" value={money(summary.openSavingPence)} />
        <Kpi
          label="Pre-live (review queue)"
          value={summary.preLiveCount.toLocaleString("en-GB")}
          href={`/${filtersToQuery({ ...f, listing: "prelive", page: 1 })}`}
        />
        <Kpi
          label="Items scanned"
          value={summary.itemsScanned === null ? "—" : summary.itemsScanned.toLocaleString("en-GB")}
          note={summary.needsReviewCount ? `${summary.needsReviewCount} open need a manual check` : undefined}
        />
      </section>

      <FilterBar f={f} sources={sources} />

      {preLive && f.listing !== "prelive" && preLive.total > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">
              <span className="badge badge-prelive mr-2 align-middle">Pre-live</span>
              In Kickio&apos;s review queue
            </h2>
            {preLive.total > preLive.rows.length && (
              <Link href={`/${filtersToQuery({ ...f, listing: "prelive", page: 1 })}`} className="text-sm underline">
                See all {preLive.total}
              </Link>
            )}
          </div>
          <p className="text-sm text-muted">Not yet visible to buyers. Open each one in Kickio&apos;s review queue.</p>
          <OpportunityTable rows={preLive.rows} empty={null} />
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {f.listing === "prelive" ? "Pre-live opportunities" : f.listing === "live" ? "Live opportunities" : "All opportunities"}
          </h2>
          <span className="text-sm text-muted">
            {list.total.toLocaleString("en-GB")} matching · {money(list.savingPence)} potential saving
          </span>
        </div>
        <OpportunityTable
          rows={list.rows}
          empty={
            summary.lastRun ? "No opportunities match these filters." : "No scans have run yet. Run the first scan to fill this in."
          }
        />
        {pages > 1 && (
          <nav className="flex items-center justify-between text-sm">
            {f.page > 1 ? (
              <Link href={`/${filtersToQuery(f, { page: f.page - 1 })}`} className="btn btn-secondary">
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted">
              Page {f.page} of {pages}
            </span>
            {f.page < pages ? (
              <Link href={`/${filtersToQuery(f, { page: f.page + 1 })}`} className="btn btn-secondary">
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 hover:border-accent">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}
