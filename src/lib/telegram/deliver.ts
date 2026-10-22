import type postgres from "postgres";
import { tg, TelegramError, telegramEnabled } from "./api";
import { type AlertForTelegram, alertButtons, alertText, inQuietHours, summaryText, type TelegramPrefs, wantsAlert } from "./message";

// Per person per run. Anything beyond this becomes one "N more" message, so a
// big rescan (or the end of quiet hours) can't flood a phone.
const MAX_PER_RUN = 8;
// Alerts older than this are never sent: Telegram is for what's new.
const WINDOW = "24 hours";

type Recipient = TelegramPrefs & { user_id: string; chat_id: string; role: string; linked_at: Date };

export function appUrl(): string {
  return (process.env.APP_URL ?? "https://kickbuy-nu.vercel.app").replace(/\/$/, "");
}

// Sends every alert that a linked person hasn't had yet. Safe to call from
// several places at once: each (alert, person) is claimed before sending.
export async function deliverTelegramAlerts(sql: postgres.Sql, now = new Date()): Promise<{ sent: number; failed: number }> {
  if (!telegramEnabled()) return { sent: 0, failed: 0 };
  const recipients = await sql<Recipient[]>`
    select t.user_id, t.chat_id::text, u.role, t.linked_at, t.min_discount_pct, t.include_needs_check,
           t.live_only, t.quiet_from_hour, t.quiet_to_hour
    from kickbuy.telegram_links t
    join kickbuy.app_users u on u.user_id = t.user_id and u.active
    where t.chat_id is not null and not t.paused
  `;
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    if (inQuietHours(r, now)) continue;
    const pending = await sql<AlertForTelegram[]>`
      select a.id as alert_id, a.kind, a.ask_pence, a.ref_price_pence, a.discount_pct,
             (select min(p.ask_pence) from kickbuy.alerts p
              where p.listing_id = a.listing_id and p.created_at < a.created_at)::int as previous_ask_pence,
             o.id as opportunity_id, o.title, o.condition, o.size, o.manufacturer, o.source_name, o.source_url,
             o.pre_live, o.image_url, o.ask_currency, o.ref_sold_at, o.ref_source, o.saving_pence,
             o.confidence, o.needs_review, o.match_notes
      from kickbuy.alerts a
      join kickbuy.opportunities o on o.id = a.opportunity_id
      where a.created_at > greatest(${r.linked_at}, now() - ${WINDOW}::interval)
        and o.removed_at is null
        and o.status in ('new', 'watching')
        and not exists (
          select 1 from kickbuy.telegram_deliveries d where d.alert_id = a.id and d.user_id = ${r.user_id}
        )
      order by a.created_at
    `;
    const wanted = pending.filter((a) => wantsAlert(r, a));
    if (wanted.length === 0) continue;
    const now_ = wanted.slice(0, MAX_PER_RUN);
    const rest = wanted.slice(MAX_PER_RUN);
    const canAct = r.role === "buyer" || r.role === "owner";

    for (const a of now_) {
      const [claim] = await sql`
        insert into kickbuy.telegram_deliveries (alert_id, user_id) values (${a.alert_id}, ${r.user_id})
        on conflict do nothing returning alert_id
      `;
      if (!claim) continue; // another run got it
      try {
        const messageId = await sendAlert(r.chat_id, a, canAct);
        await sql`
          update kickbuy.telegram_deliveries set sent_at = now(), message_id = ${messageId}, outcome = 'sent'
          where alert_id = ${a.alert_id} and user_id = ${r.user_id}
        `;
        sent += 1;
      } catch (e) {
        failed += 1;
        console.error("[telegram] send failed", e);
        if (e instanceof TelegramError && e.chatGone) {
          // Blocked the bot or deleted the chat: pause, keep the claim.
          await sql`update kickbuy.telegram_links set paused = true, updated_at = now() where user_id = ${r.user_id}`;
          await sql`
            update kickbuy.telegram_deliveries set outcome = ${`failed: ${e.message}`.slice(0, 300)}
            where alert_id = ${a.alert_id} and user_id = ${r.user_id}
          `;
          break;
        }
        // Anything else: release the claim so the next run retries.
        await sql`delete from kickbuy.telegram_deliveries where alert_id = ${a.alert_id} and user_id = ${r.user_id}`;
      }
    }

    if (rest.length > 0) {
      const claimed = await sql`
        insert into kickbuy.telegram_deliveries (alert_id, user_id, outcome, sent_at)
        select x, ${r.user_id}, 'summarised', now() from unnest(${rest.map((a) => a.alert_id)}::uuid[]) as x
        on conflict do nothing returning alert_id
      `;
      if (claimed.length > 0) {
        await tg("sendMessage", {
          chat_id: r.chat_id,
          text: summaryText(claimed.length, appUrl()),
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }).catch((e) => console.error("[telegram] summary failed", e));
      }
    }
  }
  return { sent, failed };
}

// A photo message when there's an image Telegram can fetch, otherwise text.
export async function sendAlert(chatId: string, a: AlertForTelegram, canAct: boolean): Promise<number> {
  const reply_markup = { inline_keyboard: alertButtons(a, appUrl(), canAct) };
  const text = alertText(a);
  if (a.image_url && /^https:\/\//.test(a.image_url)) {
    try {
      const m = await tg<{ message_id: number }>("sendPhoto", {
        chat_id: chatId,
        photo: a.image_url,
        caption: text,
        parse_mode: "HTML",
        reply_markup,
      });
      return m.message_id;
    } catch (e) {
      if (e instanceof TelegramError && e.chatGone) throw e;
      // Unfetchable or unsupported image: fall back to text.
    }
  }
  const m = await tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup,
  });
  return m.message_id;
}
