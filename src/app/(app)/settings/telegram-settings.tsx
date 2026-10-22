"use client";
import { useActionState, useState, useTransition } from "react";
import {
  connectTelegram,
  disconnectTelegram,
  saveTelegramPrefs,
  setTelegramPaused,
  setupTelegramWebhook,
  type TelegramResult,
} from "./telegram-actions";

export type TelegramLink = {
  linked: boolean;
  paused: boolean;
  min_discount_pct: string | null;
  include_needs_check: boolean;
  live_only: boolean;
  quiet_from_hour: number | null;
  quiet_to_hour: number | null;
} | null;

type Props = {
  enabled: boolean;
  isOwner: boolean;
  webhook: { url: string; ok: boolean; error: string | null } | null;
  link: TelegramLink;
  appThreshold: number;
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function TelegramSettings({ enabled, isOwner, webhook, link, appThreshold }: Props) {
  const [connect, setConnect] = useState<TelegramResult>(null);
  const [pending, start] = useTransition();
  const [saved, save, saving] = useActionState(saveTelegramPrefs, null);
  const [setup, setSetup] = useState<TelegramResult>(null);

  return (
    <div className="card space-y-4 p-4 text-sm">
      <div>
        <p className="font-medium">Telegram alerts</p>
        <p className="text-muted">Get new opportunities and price drops on your phone, with Watch / Dismiss / Remove buttons.</p>
      </div>

      {!enabled ? (
        <p className="rounded bg-warn-bg p-2 text-warn">
          Not set up yet. {isOwner ? "Create a bot with @BotFather and add its token to Vercel as TELEGRAM_BOT_TOKEN." : "Ask an owner to set up the bot."}
        </p>
      ) : !link?.linked ? (
        <div className="space-y-2">
          <button
            type="button"
            className="btn w-full justify-center sm:w-auto"
            disabled={pending}
            onClick={() => start(async () => setConnect(await connectTelegram()))}
          >
            {pending ? "Creating link…" : "Connect Telegram"}
          </button>
          {connect && (
            <div className={connect.ok ? "space-y-1" : "text-warn"}>
              <p>{connect.message}</p>
              {connect.link && (
                <a href={connect.link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                  Open Telegram ↗
                </a>
              )}
              {connect.link && <p className="text-xs text-muted">The link works once and expires in 15 minutes. Refresh this page after tapping Start.</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={link.paused ? "badge badge-warn" : "badge badge-good"}>{link.paused ? "Paused" : "Connected"}</span>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(() => setTelegramPaused(!link.paused))}>
              {link.paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className="btn btn-secondary text-warn!"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Disconnect Telegram? No more alerts will be sent there.")) start(() => disconnectTelegram());
              }}
            >
              Disconnect
            </button>
          </div>

          <form action={save} className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Only alert at or above (%)</span>
              <input
                name="min_discount_pct"
                type="number"
                inputMode="numeric"
                min={1}
                max={95}
                defaultValue={link.min_discount_pct === null ? "" : Number(link.min_discount_pct)}
                placeholder={`Same as app (${appThreshold}%)`}
                className="input mt-1"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="label">Quiet from (UK)</span>
                <select name="quiet_from_hour" defaultValue={link.quiet_from_hour ?? ""} className="input mt-1">
                  <option value="">Off</option>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{hh(h)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">until</span>
                <select name="quiet_to_hour" defaultValue={link.quiet_to_hour ?? ""} className="input mt-1">
                  <option value="">Off</option>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{hh(h)}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex min-h-9 items-center gap-2">
              <input type="checkbox" name="include_needs_check" defaultChecked={link.include_needs_check} />
              Include matches that need a check
            </label>
            <label className="flex min-h-9 items-center gap-2">
              <input type="checkbox" name="live_only" defaultChecked={link.live_only} />
              Live listings only (skip pre-live)
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button className="btn w-full justify-center sm:w-auto" disabled={saving}>
                {saving ? "Saving…" : "Save Telegram settings"}
              </button>
              {saved && <span className={saved.ok ? "text-muted" : "text-warn"}>{saved.message}</span>}
            </div>
            <p className="text-xs text-muted sm:col-span-2">
              Alerts held during quiet hours are sent when they end. At most 8 messages per scan; anything more comes as one
              summary.
            </p>
          </form>
        </div>
      )}

      {isOwner && enabled && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted">
            Bot webhook:{" "}
            {webhook?.ok ? (
              <span className="text-good">connected ({webhook.url})</span>
            ) : (
              <span className="text-warn">{webhook?.error ?? "not connected"}</span>
            )}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => start(async () => setSetup(await setupTelegramWebhook()))}
          >
            {webhook?.ok ? "Reconnect bot" : "Connect bot"}
          </button>
          {setup && <p className={setup.ok ? "text-muted" : "text-warn"}>{setup.message}</p>}
        </div>
      )}
    </div>
  );
}
