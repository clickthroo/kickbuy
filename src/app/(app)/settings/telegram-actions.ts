"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { audit, requireUser } from "@/lib/auth";
import { app } from "@/lib/db";
import { getBotUsername, tg, telegramEnabled, webhookSecret } from "@/lib/telegram/api";
import { appUrl } from "@/lib/telegram/deliver";

export type TelegramResult = { ok: boolean; message: string; link?: string } | null;

// A one-time link that opens the bot with a code; the bot links whichever
// chat sends it back within 15 minutes.
export async function connectTelegram(): Promise<TelegramResult> {
  const user = await requireUser();
  if (!telegramEnabled()) return { ok: false, message: "The Telegram bot isn't set up yet." };
  const code = randomBytes(18).toString("base64url");
  await app()`
    insert into kickbuy.telegram_links (user_id, link_code, link_code_expires_at)
    values (${user.id}, ${code}, now() + interval '15 minutes')
    on conflict (user_id) do update
      set link_code = excluded.link_code, link_code_expires_at = excluded.link_code_expires_at, updated_at = now()
  `;
  const username = await getBotUsername();
  return { ok: true, message: "Open the link on the phone with Telegram, then tap Start.", link: `https://t.me/${username}?start=${code}` };
}

export async function saveTelegramPrefs(_prev: TelegramResult, form: FormData): Promise<TelegramResult> {
  const user = await requireUser();
  const minRaw = String(form.get("min_discount_pct") ?? "").trim();
  const min = minRaw === "" ? null : Number(minRaw);
  if (min !== null && !(min >= 1 && min <= 95)) return { ok: false, message: "Minimum discount must be 1–95%, or blank." };
  const hour = (name: string) => {
    const v = String(form.get(name) ?? "");
    return v === "" ? null : Math.min(23, Math.max(0, Math.trunc(Number(v))));
  };
  const from = hour("quiet_from_hour");
  const to = hour("quiet_to_hour");
  if ((from === null) !== (to === null)) return { ok: false, message: "Set both quiet-hours times, or neither." };
  await app()`
    update kickbuy.telegram_links set
      min_discount_pct = ${min},
      include_needs_check = ${form.get("include_needs_check") === "on"},
      live_only = ${form.get("live_only") === "on"},
      quiet_from_hour = ${from},
      quiet_to_hour = ${to},
      updated_at = now()
    where user_id = ${user.id}
  `;
  revalidatePath("/settings");
  return { ok: true, message: "Saved." };
}

export async function setTelegramPaused(paused: boolean) {
  const user = await requireUser();
  await app()`update kickbuy.telegram_links set paused = ${paused}, updated_at = now() where user_id = ${user.id}`;
  revalidatePath("/settings");
}

export async function disconnectTelegram() {
  const user = await requireUser();
  const [link] = await app()<{ chat_id: string | null }[]>`
    delete from kickbuy.telegram_links where user_id = ${user.id} returning chat_id::text
  `;
  if (link?.chat_id) {
    await tg("sendMessage", { chat_id: link.chat_id, text: "Disconnected from KickBuy. No more alerts will be sent here." }).catch(
      () => {},
    );
  }
  await audit(user.id, "telegram.unlinked", {});
  revalidatePath("/settings");
}

// Owner only: point Telegram at this deployment's webhook and set the
// command menu. Run once after adding the token, and again if the URL changes.
export async function setupTelegramWebhook(): Promise<TelegramResult> {
  const user = await requireUser("owner");
  if (!telegramEnabled()) return { ok: false, message: "Add TELEGRAM_BOT_TOKEN in Vercel first, then redeploy." };
  try {
    await tg("setWebhook", {
      url: `${appUrl()}/api/telegram`,
      secret_token: webhookSecret(),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    await tg("setMyCommands", {
      commands: [
        { command: "status", description: "Is this chat connected?" },
        { command: "stop", description: "Pause alerts" },
        { command: "resume", description: "Resume alerts" },
      ],
    });
    await tg("setMyDescription", { description: "KickBuy buying alerts. Connect from KickBuy → Settings." }).catch(() => {});
    await audit(user.id, "telegram.webhook_set", { url: `${appUrl()}/api/telegram` });
    revalidatePath("/settings");
    return { ok: true, message: `Bot connected to ${appUrl()}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
