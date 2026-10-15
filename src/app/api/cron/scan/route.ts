import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { scanNow } from "@/lib/scan";

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
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cron/scan]", e);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
