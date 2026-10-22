import { hasRole, requireUser } from "@/lib/auth";
import { app, kickio } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { saleSourceLabel } from "@/lib/labels";
import { loadSettings } from "@/lib/settings";
import { tg, telegramEnabled } from "@/lib/telegram/api";
import { appUrl } from "@/lib/telegram/deliver";
import { SettingsForm } from "./settings-form";
import { type TelegramLink, TelegramSettings } from "./telegram-settings";

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, sourceRows, shopRows] = await Promise.all([
    loadSettings(app()),
    kickio()<{ source: string; n: number }[]>`
      select source, count(*)::int as n from kickbuy.sales group by source order by n desc
    `.catch(() => []),
    kickio()<{ name: string; n: number }[]>`
      select btrim(source_name) as name, count(*)::int as n from kickbuy.inventory
      where source_name is not null group by 1 order by n desc
    `.catch(() => []),
  ]);
  const shops = shopRows.map((r) => ({ name: r.name, count: r.n }));
  for (const s of settings.excludedListingSources) {
    if (!shops.some((x) => x.name === s.trim())) shops.push({ name: s.trim(), count: 0 });
  }
  const sources = sourceRows.map((r) => ({ value: r.source, label: saleSourceLabel(r.source), count: r.n }));
  for (const s of settings.saleSources ?? []) {
    if (!sources.some((x) => x.value === s)) sources.push({ value: s, label: saleSourceLabel(s), count: 0 });
  }

  const telegram = telegramEnabled();
  const [linkRow] = await app()<(NonNullable<TelegramLink> & { chat_id: string | null })[]>`
    select chat_id::text, paused, min_discount_pct, include_needs_check, live_only, quiet_from_hour, quiet_to_hour
    from kickbuy.telegram_links where user_id = ${user.id}
  `;
  const link: TelegramLink = linkRow ? { ...linkRow, linked: linkRow.chat_id !== null } : null;
  const webhook =
    telegram && hasRole(user, "owner")
      ? await tg<{ url: string; last_error_message?: string }>("getWebhookInfo")
          .then((w) => ({
            url: w.url,
            ok: w.url === `${appUrl()}/api/telegram` && !w.last_error_message,
            error: w.last_error_message ?? (w.url ? `pointing at ${w.url}` : null),
          }))
          .catch((e) => ({ url: "", ok: false, error: e instanceof Error ? e.message : String(e) }))
      : null;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Settings</h1>
        <p className="text-sm text-muted">Last changed {dateTime(settings.updatedAt)}.</p>
      </div>
      <SettingsForm
        canEdit={hasRole(user, "owner")}
        settings={{
          minDiscountPct: settings.minDiscountPct,
          maxSaleAgeMonths: settings.maxSaleAgeMonths,
          scanIntervalMinutes: settings.scanIntervalMinutes,
          requireExactSize: settings.requireExactSize,
          alertsEnabled: settings.alertsEnabled,
          saleSources: settings.saleSources,
          listingSizes: settings.listingSizes,
          worstCondition: settings.worstCondition,
          excludedListingSources: settings.excludedListingSources,
        }}
        sources={sources}
        shops={shops}
      />
      <TelegramSettings
        enabled={telegram}
        isOwner={hasRole(user, "owner")}
        webhook={webhook}
        link={link}
        appThreshold={settings.minDiscountPct}
      />
    </div>
  );
}
