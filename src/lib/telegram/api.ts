import { createHash } from "node:crypto";

// Minimal Telegram Bot API client. Configured by one environment variable,
// TELEGRAM_BOT_TOKEN (from @BotFather); without it the feature is off.

export function telegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export const telegramEnabled = () => telegramToken() !== null;

// The secret Telegram sends back on every webhook call, derived from the
// token so there's only one thing to configure.
export function webhookSecret(): string | null {
  const token = telegramToken();
  return token ? createHash("sha256").update(`kickbuy-webhook:${token}`).digest("hex").slice(0, 48) : null;
}

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    description: string,
  ) {
    super(`Telegram ${method} failed (${code}): ${description}`);
  }
  // The person blocked the bot or deleted the chat: stop sending.
  get chatGone() {
    return this.code === 403 || /chat not found/i.test(this.message);
  }
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = telegramToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; error_code?: number; description?: string };
  if (!json.ok) throw new TelegramError(method, json.error_code ?? res.status, json.description ?? res.statusText);
  return json.result as T;
}

let botUsername: string | null = null;
export async function getBotUsername(): Promise<string> {
  botUsername ??= (await tg<{ username: string }>("getMe")).username;
  return botUsername;
}
