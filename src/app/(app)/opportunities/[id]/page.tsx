import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "@/components/external-link";
import { ConfidenceBadge, PreLiveBadge, StaleBadge, StatusBadge } from "@/components/badges";
import { hasRole, requireUser } from "@/lib/auth";
import { getOpportunity } from "@/lib/data/opportunities";
import { age, date, dateTime, money, pct } from "@/lib/format";
import { kickioListingUrl, kickioReviewQueueUrl } from "@/lib/kickio-links";
import { CONFIDENCE_LABELS, listingStatusLabel, saleSourceLabel } from "@/lib/labels";
import { restoreOpportunity, setOpportunityStatus } from "../actions";
import { RemoveButton } from "@/components/remove-button";

export default async function OpportunityPage({ params }: PageProps<"/opportunities/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getOpportunity(id);
  if (!data) notFound();
  const { opportunity: o, snapshots, actions, alerts } = data;
  const ccy = o.ask_currency;
  const canAct = hasRole(user, "buyer");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Opportunities
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{o.title}</h1>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusBadge status={o.status} />
          {o.pre_live && <PreLiveBadge />}
          <ConfidenceBadge confidence={o.confidence} needsReview={o.needs_review} />
          {o.ref_stale && <StaleBadge />}
        </div>
        {o.removed_at && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded bg-warn-bg p-2 text-sm text-warn">
            <span>
              Removed {dateTime(o.removed_at)}
              {o.removed_reason ? `: ${o.removed_reason}` : ""}. It isn&apos;t shown anywhere in KickBuy.
            </span>
            {canAct && (
              <form action={restoreOpportunity}>
                <input type="hidden" name="id" value={o.id} />
                <button className="btn btn-secondary py-1 text-xs">Restore</button>
              </form>
            )}
          </div>
        )}
        {o.status === "expired" && (
          <p className="mt-3 rounded bg-warn-bg p-2 text-sm text-warn">
            Expired {dateTime(o.expired_at)}: {o.expired_reason}
          </p>
        )}
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Figure label="Asking price" value={money(o.ask_pence, ccy)} />
            <Figure label="Last sold" value={money(o.ref_price_pence, ccy)} note={date(o.ref_sold_at)} />
            <Figure
              label="Below last sold"
              value={pct(o.discount_pct)}
              note={`Saving ${money(o.saving_pence, ccy)}`}
              strong
            />
          </div>
          <p className="mt-4 text-xs text-muted">
            Discount = (last sold − asking) ÷ last sold = ({money(o.ref_price_pence, ccy)} − {money(o.ask_pence, ccy)}) ÷{" "}
            {money(o.ref_price_pence, ccy)}. Prices exclude postage and tax.
          </p>
        </div>

        <div className="card space-y-3 p-4 text-sm">
          <h2 className="font-medium">On Kickio</h2>
          <p>
            {listingStatusLabel(o.listing_status, o.prep_status)}
            {o.source_name && <span className="text-muted"> · from {o.source_name}</span>}
          </p>
          <div className="flex flex-col gap-2">
            <ExternalLink href={kickioListingUrl(o.listing_id)} className="btn btn-secondary justify-center">
              Open listing on Kickio ↗
            </ExternalLink>
            {o.source_url && (
              <ExternalLink href={o.source_url} className="btn btn-secondary justify-center">
                Open source product page{o.source_name ? ` (${o.source_name})` : ""} ↗
              </ExternalLink>
            )}
            {o.pre_live && (
              <>
                <ExternalLink href={kickioReviewQueueUrl()} className="btn btn-secondary justify-center">
                  Open Kickio review queue ↗
                </ExternalLink>
                <p className="text-xs text-muted">
                  Kickio&apos;s review queue has no per-listing link: find it on the Listings tab. Listing id{" "}
                  <code className="font-mono">{o.listing_id}</code>
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4 text-sm">
          <h2 className="mb-3 font-medium">This listing</h2>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5">
            <Row k="Club / country" v={o.team} />
            <Row k="Season" v={o.season} />
            <Row k="Type" v={o.shirt_type} />
            <Row k="Manufacturer" v={o.manufacturer} />
            <Row k="Player / name" v={o.player_name} />
            <Row k="Size" v={o.size} />
            <Row k="Condition" v={o.condition} />
            <Row k="Listed" v={dateTime(o.listed_at)} />
            <Row k="Kickio product" v={o.product_id ? "Linked" : "Not linked yet"} />
          </dl>
        </div>

        <div className="card p-4 text-sm">
          <h2 className="mb-3 font-medium">Reference sale</h2>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5">
            <Row k="Sold for" v={money(o.ref_price_pence, ccy)} />
            {o.ref_fx_rate && (
              <Row
                k="Converted from"
                v={`${money(o.ref_original_pence, o.ref_currency)} at ${Number(o.ref_fx_rate)} ${o.ref_currency}/GBP`}
              />
            )}
            <Row k="Sold on" v={`${date(o.ref_sold_at)} (${age(o.ref_sold_at)})`} />
            <Row k="Where" v={saleSourceLabel(o.ref_source)} />
            <Row k="Size" v={o.ref_size} />
            <Row k="Match" v={CONFIDENCE_LABELS[o.confidence]} />
          </dl>
          {o.ref_url && (
            <ExternalLink href={o.ref_url} className="mt-3 inline-block underline">
              View the sold item ↗
            </ExternalLink>
          )}
          {o.match_notes.length > 0 && (
            <div className="mt-3 rounded bg-warn-bg p-2 text-xs text-warn">
              <p className="font-medium">Check before acting:</p>
              <ul className="list-disc pl-4">
                {o.match_notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="card p-4 text-sm">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Recent comparable sales</h2>
          <span className="text-muted">
            {o.comparable_count} comparable sale{o.comparable_count === 1 ? "" : "s"}
            {o.median_pence !== null && o.recent_sales.length > 1 && (
              <> · median of last {o.recent_sales.length}: {money(o.median_pence, ccy)}</>
            )}
          </span>
        </div>
        <p className="mb-2 text-xs text-muted">For context only: the discount always uses the reference sale above.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Sold</th>
              <th>Where</th>
              <th>Size</th>
              <th className="num">Price</th>
            </tr>
          </thead>
          <tbody>
            {o.recent_sales.map((s) => (
              <tr key={s.saleId}>
                <td>
                  {date(s.soldAt)}
                  {s.saleId === o.ref_sale_id && <span className="badge badge-good ml-2">reference</span>}
                </td>
                <td>
                  {s.url ? (
                    <ExternalLink href={s.url} className="underline">
                      {saleSourceLabel(s.source)}
                    </ExternalLink>
                  ) : (
                    saleSourceLabel(s.source)
                  )}
                </td>
                <td>{s.size ?? "—"}</td>
                <td className="num">
                  {money(s.pence, ccy)}
                  {s.currency !== ccy && <span className="text-xs text-muted"> ({money(s.originalPence, s.currency)})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canAct && o.status !== "expired" && (
        <section className="card p-4">
          <h2 className="mb-3 font-medium">Follow up</h2>
          <form action={setOpportunityStatus} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="id" value={o.id} />
            <label className="min-w-64 flex-1">
              <span className="label">Note (optional)</span>
              <input name="note" maxLength={500} className="input mt-1" />
            </label>
            {o.status !== "watching" && (
              <button name="action" value="watch" className="btn">
                Watch
              </button>
            )}
            {o.status !== "dismissed" && (
              <button name="action" value="dismiss" className="btn btn-secondary">
                Dismiss
              </button>
            )}
            {o.status !== "new" && (
              <button name="action" value="reopen" className="btn btn-secondary">
                Back to new
              </button>
            )}
          </form>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted">
              Dismissed comes back as new if the price drops below today&apos;s {money(o.ask_pence, ccy)}. Removed
              never comes back.
            </p>
            {!o.removed_at && (
              <RemoveButton id={o.id} title={o.title} from="detail" className="btn btn-secondary text-warn" />
            )}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4 text-sm">
          <h2 className="mb-2 font-medium">Price history</h2>
          {snapshots.length === 0 ? (
            <p className="text-muted">No changes recorded yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Seen</th>
                  <th className="num">Ask</th>
                  <th className="num">Last sold</th>
                  <th className="num">Discount</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s, i) => (
                  <tr key={i}>
                    <td>
                      {dateTime(s.observed_at)}
                      <div className="text-xs text-muted">{listingStatusLabel(s.listing_status, null)}</div>
                    </td>
                    <td className="num">{money(s.ask_pence, ccy)}</td>
                    <td className="num">{money(s.ref_price_pence, ccy)}</td>
                    <td className="num">{pct(s.discount_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-4 text-sm">
          <h2 className="mb-2 font-medium">History</h2>
          <ul className="space-y-1.5">
            {[
              ...alerts.map((a) => ({
                at: a.created_at,
                text: `${a.kind === "new" ? "Alert: new opportunity" : "Alert: price dropped"} at ${money(a.ask_pence, ccy)} (${pct(a.discount_pct)})`,
              })),
              ...actions.map((a) => ({
                at: a.at,
                text: `${a.email ?? "Someone"} ${ACTION_LABELS[a.action] ?? a.action}${a.detail.note ? `: "${a.detail.note}"` : ""}`,
              })),
              { at: o.first_detected_at, text: "First detected" },
            ]
              .sort((a, b) => b.at.getTime() - a.at.getTime())
              .map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-36 shrink-0 text-muted">{dateTime(e.at)}</span>
                  <span>{e.text}</span>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Last checked {dateTime(o.last_evaluated_at)}.</p>
        </div>
      </section>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "opportunity.watch": "started watching",
  "opportunity.dismiss": "dismissed it",
  "opportunity.reopen": "moved it back to new",
};

function Figure({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${strong ? "text-good" : ""}`}>{value}</p>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd>{v || "—"}</dd>
    </>
  );
}
