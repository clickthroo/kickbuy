"use client";
import { useActionState, useState } from "react";
import { saveSettings } from "./actions";

type Props = {
  canEdit: boolean;
  settings: {
    minDiscountPct: number;
    maxSaleAgeMonths: number | null;
    scanIntervalMinutes: number;
    requireExactSize: boolean;
    alertsEnabled: boolean;
    saleSources: string[] | null;
  };
  sources: { value: string; label: string; count: number }[];
};

export function SettingsForm({ canEdit, settings, sources }: Props) {
  const [state, action, pending] = useActionState(saveSettings, null);
  const [threshold, setThreshold] = useState(settings.minDiscountPct);
  const [allSources, setAllSources] = useState(settings.saleSources === null);

  return (
    <form action={action} className="space-y-5">
      <fieldset disabled={!canEdit} className="space-y-5">
        <div className="card space-y-2 p-4">
          <label htmlFor="threshold" className="font-medium">
            Minimum discount: <span className="tabular-nums">{threshold}%</span>
          </label>
          <p className="text-sm text-muted">Flag listings at or above this discount to their last sale.</p>
          <input
            id="threshold"
            name="min_discount_pct"
            type="range"
            min={5}
            max={60}
            step={1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <div className="relative h-4 text-xs text-muted">
            {[5, 20, 40, 60].map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                style={{ left: `${((t - 5) / 55) * 100}%` }}
              >
                {t}%
              </span>
            ))}
          </div>
        </div>

        <div className="card grid gap-4 p-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Maximum age of the last sale</span>
            <select
              name="max_sale_age_months"
              defaultValue={settings.maxSaleAgeMonths === null ? "none" : String(settings.maxSaleAgeMonths)}
              className="input mt-1"
            >
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="24">24 months</option>
              <option value="none">No limit</option>
            </select>
            <span className="mt-1 block text-xs text-muted">
              Older sales are only used when there&apos;s nothing newer, and are then marked stale.
            </span>
          </label>
          <label className="text-sm">
            <span className="font-medium">Automatic scan frequency</span>
            <select name="scan_interval_minutes" defaultValue={String(settings.scanIntervalMinutes)} className="input mt-1">
              <option value="5">Every 5 minutes</option>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
              <option value="180">Every 3 hours</option>
              <option value="1440">Daily</option>
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="require_exact_size" defaultChecked={settings.requireExactSize} className="mt-1" />
            <span>
              <span className="font-medium">Require an exact size match</span>
              <span className="block text-xs text-muted">
                Off: the same size is preferred, and other adult sizes are used (at lower confidence) when there&apos;s no
                same-size sale. Kids&apos; and adult sizes are never mixed.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="alerts_enabled" defaultChecked={settings.alertsEnabled} className="mt-1" />
            <span>
              <span className="font-medium">Alerts for new opportunities</span>
              <span className="block text-xs text-muted">In-app alerts, once per listing and price.</span>
            </span>
          </label>
        </div>

        <div className="card space-y-2 p-4 text-sm">
          <p className="font-medium">Which sales count as evidence</p>
          <p className="text-muted">
            Kickio&apos;s sales history includes Kickio marketplace sales and sold items recorded from other shops.
            Approved sales only; excluded, refunded and disputed sales are never used.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="all_sources" checked={allSources} onChange={(e) => setAllSources(e.target.checked)} />
            All sources
          </label>
          {!allSources && (
            <div className="grid gap-1 pl-6 sm:grid-cols-2">
              {sources.map((s) => (
                <label key={s.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="sale_sources"
                    value={s.value}
                    defaultChecked={settings.saleSources?.includes(s.value) ?? true}
                  />
                  {s.label} <span className="text-xs text-muted">({s.count.toLocaleString("en-GB")})</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <button className="btn" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </button>
          {state && <span className={`text-sm ${state.ok ? "text-muted" : "text-warn"}`}>{state.message}</span>}
        </div>
      ) : (
        <p className="text-sm text-muted">Only owners can change settings.</p>
      )}
    </form>
  );
}
