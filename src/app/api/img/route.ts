import { type NextRequest, NextResponse } from "next/server";
import { getSessionState } from "@/lib/auth";
import { app } from "@/lib/db";

const MAX_BYTES = 5 * 1024 * 1024;

// Image proxy for third-party listing photos, so the shop hosting them sees
// a request from KickBuy's server rather than from the viewer's browser.
// Signed-in users only, and only for URLs KickBuy has stored as an
// opportunity image: it can't be used to fetch arbitrary addresses.
export async function GET(request: NextRequest) {
  const state = await getSessionState();
  if (state.kind !== "ok") return new NextResponse(null, { status: 401 });

  const url = request.nextUrl.searchParams.get("u") ?? "";
  const [known] = await app()<{ ok: number }[]>`
    select 1 as ok from kickbuy.opportunities where image_url = ${url} limit 1
  `;
  if (!known) return new NextResponse(null, { status: 404 });

  try {
    const upstream = await fetch(url, {
      referrerPolicy: "no-referrer",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "image/*" },
    });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) return new NextResponse(null, { status: 502 });
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new NextResponse(null, { status: 502 });
    return new NextResponse(body, {
      headers: {
        "content-type": type,
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
