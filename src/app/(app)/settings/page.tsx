import { hasRole, requireUser } from "@/lib/auth";
import { app, kickio } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { saleSourceLabel } from "@/lib/labels";
import { loadSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

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
    </div>
  );
}
