import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { app } from "@/lib/db";
import { removeForGood, setStatus, UUID } from "@/lib/data/opportunity-actions";
import { tg, webhookSecret } from "@/lib/telegram/api";

// Telegram calls this for messages to the bot and button taps. It's public
// (no KickBuy session), so every call must carry the webhook secret, and only
// chats linked to an active KickBuy user can do anything.

type Chat = { id: number; type: string };
type Update = {
  message?: { chat: Chat; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: Chat; message_id: number; reply_markup?: unknown } };
};

function authorised(request: NextRequest): boolean {
  const expected = webhookSecret();
  if (!expected) return false;
  const a = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const update = (await request.json().catch(() => ({}))) as Update;
  try {
    if (update.message) await onMessage(update.message.chat, update.message.text ?? "");
    else if (update.callback_query) await onButton(update.callback_query);
  } catch (e) {
    // Always 200: a non-2xx makes Telegram resend the same update forever.
    console.error("[telegram] update failed", e);
  }
  return NextResponse.json({ ok: true });
}

const say = (chatId: number, text: string) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });

type Linked = { user_id: string; email: string; role: string; paused: boolean };
async function linkedUser(chatId: number): Promise<Linked | null> {
  const [u] = await app()<Linked[]>`
    select t.user_id, u.email, u.role, t.paused from kickbuy.telegram_links t
    join kickbuy.app_users u on u.user_id = t.user_id and u.active
    where t.chat_id = ${chatId}
  `;
  return u ?? null;
}

async function onMessage(chat: Chat, text: string) {
  if (chat.type !== "private") return; // never act in groups
  const [command, arg] = text.trim().split(/\s+/, 2);
  const sql = app();

  if (command === "/start" && arg && /^[A-Za-z0-9_-]{8,64}$/.test(arg)) {
    const [link] = await sql<{ user_id: string; email: string }[]>`
      select t.user_id, u.email from kickbuy.telegram_links t
      join kickbuy.app_users u on u.user_id = t.user_id and u.active
      where t.link_code = ${arg} and t.link_code_expires_at > now()
    `;
    if (!link) return say(chat.id, "That link has expired. Open KickBuy → Settings → Telegram alerts and connect again.");
    await sql.begin(async (tx) => {
      // A chat belongs to one KickBuy user.
      await tx`update kickbuy.telegram_links set chat_id = null, linked_at = null where chat_id = ${chat.id}`;
      await tx`
        update kickbuy.telegram_links
        set chat_id = ${chat.id}, linked_at = now(), link_code = null, link_code_expires_at = null,
            paused = false, updated_at = now()
        where user_id = ${link.user_id}
      `;
      await tx`
        insert into kickbuy.user_actions (user_id, action, detail)
        values (${link.user_id}, 'telegram.linked', ${tx.json({})})
      `;
    });
    return say(
      chat.id,
      `✅ Connected to KickBuy as <b>${link.email.replace(/[<>&]/g, "")}</b>.\nYou'll get new opportunities here as they're found. /stop pauses, /resume restarts.`,
    );
  }

  const user = await linkedUser(chat.id);
  if (!user) return say(chat.id, "This chat isn't connected. Open KickBuy → Settings → Telegram alerts to connect.");

  if (command === "/stop" || command === "/resume") {
    const paused = command === "/stop";
    await sql`update kickbuy.telegram_links set paused = ${paused}, updated_at = now() where user_id = ${user.user_id}`;
    return say(chat.id, paused ? "⏸ Paused. Send /resume to start again." : "▶️ Alerts are back on.");
  }
  if (command === "/status" || command === "/start") {
    const [o] = await sql<{ n: number }[]>`
      select count(*)::int as n from kickbuy.opportunities where removed_at is null and status in ('new', 'watching')
    `;
    return say(
      chat.id,
      `Connected as <b>${user.email.replace(/[<>&]/g, "")}</b> (${user.role}). Alerts are ${user.paused ? "paused" : "on"}.\n${o.n} open opportunities.`,
    );
  }
  return say(chat.id, "Commands: /status, /stop, /resume. Alert preferences are in KickBuy → Settings.");
}

const BUTTONS: Record<string, { label: string; done: string }> = {
  w: { label: "watch", done: "👀 Watching" },
  d: { label: "dismiss", done: "✖ Dismissed" },
  r: { label: "remove", done: "🗑 Removed" },
};

async function onButton(q: NonNullable<Update["callback_query"]>) {
  const chat = q.message?.chat;
  const [kind, id] = (q.data ?? "").split(":", 2);
  const button = BUTTONS[kind];
  const answer = (text: string) => tg("answerCallbackQuery", { callback_query_id: q.id, text });
  if (kind === "x") return answer(""); // the "done" label
  if (!chat || chat.type !== "private" || !button || !id || !UUID.test(id)) return answer("Not available.");

  const user = await linkedUser(chat.id);
  if (!user) return answer("This chat isn't connected to KickBuy.");
  if (user.role !== "buyer" && user.role !== "owner") return answer("Viewers can't change opportunities.");

  const changed =
    kind === "r" ? await removeForGood(user.user_id, id) : await setStatus(user.user_id, id, kind === "w" ? "watch" : "dismiss");
  await answer(changed ? button.done : "Already done, or no longer open.");

  // Replace the action row with what happened; keep the link buttons.
  const keyboard = (q.message?.reply_markup as { inline_keyboard?: { callback_data?: string }[][] } | undefined)
    ?.inline_keyboard;
  if (keyboard && q.message) {
    const links = keyboard.filter((row) => !row.some((b) => b.callback_data));
    await tg("editMessageReplyMarkup", {
      chat_id: chat.id,
      message_id: q.message.message_id,
      reply_markup: { inline_keyboard: [...links, [{ text: changed ? button.done : "Already handled", callback_data: "x" }]] },
    }).catch(() => {});
  }
}
