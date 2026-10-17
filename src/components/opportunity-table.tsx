import Link from "next/link";
import { ExternalLink } from "@/components/external-link";
import { RemoveButton } from "@/components/remove-button";
import { displayImageUrl } from "@/lib/images";
import type { OpportunityRow } from "@/lib/data/opportunities";
import { date, money, pct } from "@/lib/format";
import { listingStatusLabel, saleSourceLabel } from "@/lib/labels";
import { ConfidenceBadge, PreLiveBadge, StaleBadge, StatusBadge } from "./badges";

// A table on wider screens; a list of cards on phones.
export function OpportunityTable({
  rows,
  empty,
  canRemove = false,
}: {
  rows: OpportunityRow[];
  empty: React.ReactNode;
  canRemove?: boolean;
}) {
  if (rows.length === 0) return <div className="card p-6 text-sm text-muted">{empty}</div>;
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {rows.map((o) => (
          <li key={o.id} className="card relative p-3">
            <div className="flex gap-3">
              <Thumb url={o.image_url} className="h-16 w-16" />
              <div className="min-w-0 flex-1 pr-8">
                <Link href={`/opportunities/${o.id}`} className="font-medium leading-snug after:absolute after:inset-0">
                  {o.title}
                </Link>
                <div className="mt-0.5 text-xs text-muted">{details(o)}</div>
              </div>
            </div>
            {canRemove && (
              <div className="absolute top-1 right-1 z-10">
                <RemoveButton id={o.id} title={o.title} />
              </div>
            )}
            <dl className="mt-3 grid grid-cols-3 gap-2 rounded bg-background p-2 text-center">
              <div>
                <dt className="text-[0.65rem] uppercase tracking-wide text-muted">Ask</dt>
                <dd className="font-semibold tabular-nums">{money(o.ask_pence, o.ask_currency)}</dd>
              </div>
              <div>
                <dt className="text-[0.65rem] uppercase tracking-wide text-muted">Last sold</dt>
                <dd className="tabular-nums">{money(o.ref_price_pence, o.ask_currency)}</dd>
              </div>
              <div>
                <dt className="text-[0.65rem] uppercase tracking-wide text-muted">Below</dt>
                <dd className="font-semibold tabular-nums text-good">{pct(o.discount_pct)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">
              Saving {money(o.saving_pence, o.ask_currency)} · sold {date(o.ref_sold_at)} on {saleSourceLabel(o.ref_source)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <StatusBadge status={o.status} />
              <ConfidenceBadge confidence={o.confidence} needsReview={o.needs_review} />
              {o.ref_stale && <StaleBadge />}
              <ListingBadges o={o} />
            </div>
          </li>
        ))}
      </ul>

      <div className="card hidden overflow-x-auto md:block">
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
              {canRemove && <th className="w-8"><span className="sr-only">Remove</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="align-top">
                <td className="min-w-64">
                  <div className="flex gap-3">
                    <Thumb url={o.image_url} className="h-12 w-12" />
                    <div className="min-w-0">
                      <Link href={`/opportunities/${o.id}`} className="font-medium hover:underline">
                        {o.title}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">{details(o)}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <ListingBadges o={o} />
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
                {canRemove && (
                  <td>
                    <RemoveButton id={o.id} title={o.title} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function details(o: OpportunityRow) {
  return [o.condition, o.size && `Size ${o.size}`, o.manufacturer].filter(Boolean).join(" · ");
}

function Thumb({ url, className }: { url: string | null; className: string }) {
  const src = displayImageUrl(url);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={`${className} shrink-0 rounded object-cover`} />
  ) : (
    <div className={`${className} shrink-0 rounded bg-background`} />
  );
}

function ListingBadges({ o }: { o: OpportunityRow }) {
  return (
    <>
      {o.pre_live ? <PreLiveBadge /> : <span className="badge">{listingStatusLabel(o.listing_status, o.prep_status)}</span>}
      {o.source_url ? (
        <ExternalLink
          href={o.source_url}
          className="badge relative z-10 hover:text-foreground hover:underline"
          title="Open the source product page"
        >
          {o.source_name ?? "Source"} ↗
        </ExternalLink>
      ) : (
        o.source_name && <span className="badge">{o.source_name}</span>
      )}
      <span className="badge">Listed {date(o.listed_at)}</span>
    </>
  );
}
