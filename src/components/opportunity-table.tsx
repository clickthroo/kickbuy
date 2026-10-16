import Link from "next/link";
import { ExternalLink } from "@/components/external-link";
import { displayImageUrl } from "@/lib/images";
import type { OpportunityRow } from "@/lib/data/opportunities";
import { date, money, pct } from "@/lib/format";
import { listingStatusLabel, saleSourceLabel } from "@/lib/labels";
import { ConfidenceBadge, PreLiveBadge, StaleBadge, StatusBadge } from "./badges";

export function OpportunityTable({ rows, empty }: { rows: OpportunityRow[]; empty: React.ReactNode }) {
  if (rows.length === 0) return <div className="card p-6 text-sm text-muted">{empty}</div>;
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Shirt</th>
            <th className="num">Ask</th>
            <th className="num">Last sold</th>
            <th className="num">Discount</th>
            <th className="num">Saving</th>
            <th>Match</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="align-top">
              <td className="min-w-72">
                <div className="flex gap-3">
                  {displayImageUrl(o.image_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={displayImageUrl(o.image_url)!}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded bg-background" />
                  )}
                  <div className="min-w-0">
                    <Link href={`/opportunities/${o.id}`} className="font-medium hover:underline">
                      {o.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted">
                      {[o.condition, o.size && `Size ${o.size}`, o.manufacturer].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {o.pre_live ? <PreLiveBadge /> : <span className="badge">{listingStatusLabel(o.listing_status, o.prep_status)}</span>}
                      {o.source_url ? (
                        <ExternalLink
                          href={o.source_url}
                          className="badge hover:text-foreground hover:underline"
                          title="Open the source product page"
                        >
                          {o.source_name ?? "Source"} ↗
                        </ExternalLink>
                      ) : (
                        o.source_name && <span className="badge">{o.source_name}</span>
                      )}
                      <span className="badge">Listed {date(o.listed_at)}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td className="num font-medium">{money(o.ask_pence, o.ask_currency)}</td>
              <td className="num">
                {money(o.ref_price_pence, o.ask_currency)}
                <div className="text-xs text-muted">
                  {date(o.ref_sold_at)} · {saleSourceLabel(o.ref_source)}
                </div>
                {o.ref_stale && <StaleBadge />}
              </td>
              <td className="num text-base font-semibold text-good">{pct(o.discount_pct)}</td>
              <td className="num">{money(o.saving_pence, o.ask_currency)}</td>
              <td>
                <ConfidenceBadge confidence={o.confidence} needsReview={o.needs_review} />
              </td>
              <td>
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
