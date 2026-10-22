// What a Telegram alert says and who gets it. Pure functions: no I/O.

import { date, money, pct } from "../format";
import { saleSourceLabel } from "../labels";

export type AlertForTelegram = {
  alert_id: string;
  kind: "new" | "price_drop";
  ask_pence: number;
  ref_price_pence: number;
  discount_pct: string | number;
  previous_ask_pence: number | null; // for price drops: the last alerted price
  opportunity_id: string;
  title: string;
  condition: string;
  size: string | null;
  manufacturer: string | null;
  source_name: string | null;
  source_url: string | null;
  pre_live: boolean;
  image_url: string | null;
  ask_currency: string;
  ref_sold_at: Date;
  ref_source: string;
  saving_pence: number;
  confidence: "high" | "medium" | "low";
  needs_review: boolean;
  match_notes: string[];
};

export type TelegramPrefs = {
  min_discount_pct: string | number | null;
  include_needs_check: boolean;
  live_only: boolean;
  quiet_from_hour: number | null;
  quiet_to_hour: number | null;
};

export type Button = { text: string; url?: string; callback_data?: string };

// Whether this person wants this alert on Telegram.
export function wantsAlert(prefs: TelegramPrefs, a: AlertForTelegram): boolean {
  if (prefs.min_discount_pct !== null && Number(a.discount_pct) < Number(prefs.min_discount_pct)) return false;
  if (!prefs.include_needs_check && a.needs_review) return false;
  if (prefs.live_only && a.pre_live) return false;
  return true;
}

// Quiet hours in UK time; "from 23 to 7" wraps past midnight. Held alerts go
// out at the end of the quiet period.
export function inQuietHours(prefs: TelegramPrefs, now: Date): boolean {
  const from = prefs.quiet_from_hour;
  const to = prefs.quiet_to_hour;
  if (from === null || to === null || from === to) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/London" }).format(now),
  );
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// HTML message body (Telegram's HTML parse mode). Kept under the 1,024
// character photo caption limit.
export function alertText(a: AlertForTelegram): string {
  const ccy = a.ask_currency;
  const headline =
    a.kind === "price_drop"
      ? `🔻 <b>Price drop: now ${pct(a.discount_pct, 0)} below</b>`
      : `🟢 <b>New opportunity: ${pct(a.discount_pct, 0)} below</b>`;
  const details = [a.condition, a.size, a.manufacturer, a.source_name?.trim()].filter(Boolean).join(" · ");
  const lines = [
    headline,
    `<b>${esc(a.title)}</b>`,
    esc(details) + (a.pre_live ? " (pre-live)" : ""),
    "",
    a.kind === "price_drop" && a.previous_ask_pence
      ? `<b>Ask ${money(a.ask_pence, ccy)}</b> (was ${money(a.previous_ask_pence, ccy)})`
      : `<b>Ask ${money(a.ask_pence, ccy)}</b>`,
    `Lowest sold ${money(a.ref_price_pence, ccy)} (${date(a.ref_sold_at)}, ${esc(saleSourceLabel(a.ref_source))})`,
    `Saving <b>${money(a.saving_pence, ccy)}</b>`,
  ];
  if (a.needs_review) {
    const why = a.match_notes.slice(0, 2).join("; ");
    lines.push(`⚠️ Needs a check${why ? `: ${esc(why)}` : ""}`);
  }
  const text = lines.join("\n");
  return text.length > 1000 ? `${text.slice(0, 997)}…` : text;
}

// Link buttons for everyone; action buttons only for buyers and owners.
export function alertButtons(a: AlertForTelegram, appUrl: string, canAct: boolean): Button[][] {
  const links: Button[] = [{ text: "Open in KickBuy", url: `${appUrl}/opportunities/${a.opportunity_id}` }];
  if (a.source_url && /^https?:\/\//.test(a.source_url)) links.push({ text: "Source page ↗", url: a.source_url });
  if (!canAct) return [links];
  return [
    links,
    [
      { text: "👀 Watch", callback_data: `w:${a.opportunity_id}` },
      { text: "✖ Dismiss", callback_data: `d:${a.opportunity_id}` },
      { text: "🗑 Remove", callback_data: `r:${a.opportunity_id}` },
    ],
  ];
}

export function summaryText(count: number, appUrl: string): string {
  return `➕ <b>${count} more alert${count === 1 ? "" : "s"}</b> since your last message. See them in KickBuy: ${appUrl}/alerts`;
}
