import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { scanNow } from "@/lib/scan";
import { sendTelegramAlerts } from "@/lib/telegram";

// Vercel Cron calls this every 5 minutes with `Authorization: Bearer
// $CRON_SECRET`. The scanner itself decides whether a scan is due, based on
// the frequency in Settings.
export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  try {
    const result = await scanNow({ trigger: "cron", respectInterval: true });
    // Every cron tick, not just after a scan: retries failures and sends
    // alerts held back by quiet hours.
    const telegram = await sendTelegramAlerts().catch((e) => {
      console.error("[cron/scan] telegram", e);
      return { error: "telegram delivery failed" };
    });
    return NextResponse.json({ ...result, telegram });
  } catch (e) {
    console.error("[cron/scan]", e);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
