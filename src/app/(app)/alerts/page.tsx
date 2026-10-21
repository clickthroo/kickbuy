import Link from "next/link";
import { PreLiveBadge, StatusBadge } from "@/components/badges";
import { requireUser } from "@/lib/auth";
import { listAlerts } from "@/lib/data/alerts";
import { dateTime, money, pct } from "@/lib/format";
import type { OpportunityStatus } from "@/lib/scan/lifecycle";
import { markAllRead } from "./actions";

export default async function AlertsPage() {
  const user = await requireUser();
  const alerts = await listAlerts(user.id);
  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Alerts</h1>
          <p className="text-sm text-muted">
            One alert per listing and price. A listing alerts again only if its price drops further.
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button className="btn btn-secondary">Mark all read</button>
          </form>
        )}
      </div>
      {alerts.length === 0 ? (
        <div className="card p-6 text-sm text-muted">No alerts yet.</div>
      ) : (
        <>
        <ul className="space-y-3 md:hidden">
          {alerts.map((a) => (
            <li key={a.id} className={`card relative p-3 ${a.read ? "text-muted" : ""}`}>
              <div className="flex items-start justify-between gap-3 text-xs text-muted">
                <span>
                  {!a.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-good" aria-label="unread" />}
                  {dateTime(a.created_at)}
                </span>
                <StatusBadge status={a.status as OpportunityStatus} />
              </div>
              <Link
                href={`/opportunities/${a.opportunity_id}`}
                className={`mt-1 block leading-snug after:absolute after:inset-0 ${a.read ? "" : "font-medium"}`}
              >
                {a.title}
              </Link>
              <p className="mt-1 text-sm tabular-nums">
                {money(a.ask_pence, a.ask_currency)} vs {money(a.ref_price_pence, a.ask_currency)} ·{" "}
                <span className="font-semibold text-good">{pct(a.discount_pct)} below</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="badge">{a.kind === "new" ? "New opportunity" : "Price dropped"}</span>
                {a.pre_live && <PreLiveBadge />}
                {a.current_ask_pence !== a.ask_pence && a.status !== "expired" && (
                  <span className="badge">now {money(a.current_ask_pence, a.ask_currency)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="card hidden overflow-x-auto md:block">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Opportunity</th>
                <th className="num">Ask</th>
                <th className="num">Lowest sold</th>
                <th className="num">Discount</th>
                <th>Now</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className={a.read ? "text-muted" : "font-medium"}>
                  <td className="whitespace-nowrap">
                    {!a.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-good" aria-label="unread" />}
                    {dateTime(a.created_at)}
                  </td>
                  <td>
                    <Link href={`/opportunities/${a.opportunity_id}`} className="hover:underline">
                      {a.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="badge">{a.kind === "new" ? "New opportunity" : "Price dropped"}</span>
                      {a.pre_live && <PreLiveBadge />}
                    </div>
                  </td>
                  <td className="num">{money(a.ask_pence, a.ask_currency)}</td>
                  <td className="num">{money(a.ref_price_pence, a.ask_currency)}</td>
                  <td className="num">{pct(a.discount_pct)}</td>
                  <td>
                    <StatusBadge status={a.status as OpportunityStatus} />
                    {a.current_ask_pence !== a.ask_pence && a.status !== "expired" && (
                      <div className="text-xs text-muted">now {money(a.current_ask_pence, a.ask_currency)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
