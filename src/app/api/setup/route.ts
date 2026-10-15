import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { app, kickio } from "@/lib/db";
import { scanNow } from "@/lib/scan";
import { supabaseAdmin } from "@/lib/supabase/server";

// One-off setup helper for a fresh deployment, for when nobody can run
// scripts/bootstrap-owner.mjs against the databases directly.
//
// Disabled (404) unless SETUP_TOKEN is set. Remove SETUP_TOKEN once the
// first owner exists.
//
//   GET /api/setup?token=…&action=check               connectivity check
//   GET /api/setup?token=…&action=owner&email=…       first owner + invite link (only while there are no owners)
//   GET /api/setup?token=…&action=scan                run a full scan now
export const maxDuration = 300;

function tokenOk(given: string | null): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!process.env.SETUP_TOKEN) return new NextResponse(null, { status: 404 });
  const q = request.nextUrl.searchParams;
  if (!tokenOk(q.get("token"))) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const action = q.get("action");
  try {
    if (action === "check") {
      const result: Record<string, unknown> = {};
      await step(result, "kickio", async () => {
        const [r] = await kickio()<{ inventory: number; sales: number; read_only: string }[]>`
          select (select count(*) from kickbuy.inventory)::int as inventory,
                 (select count(*) from kickbuy.sales)::int as sales,
                 current_setting('default_transaction_read_only') as read_only
        `;
        return r;
      });
      await step(result, "kickbuy", async () => {
        const [r] = await app()<{ users: number; scans: number }[]>`
          select (select count(*) from kickbuy.app_users)::int as users,
                 (select count(*) from kickbuy.scan_runs)::int as scans
        `;
        return r;
      });
      await step(result, "auth_admin", async () => {
        const { data, error } = await supabaseAdmin().auth.admin.listUsers({ perPage: 1 });
        if (error) throw error;
        return { ok: true, users: data.users.length };
      });
      return NextResponse.json(result);
    }

    if (action === "owner") {
      const email = (q.get("email") ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "email" }, { status: 400 });
      const [{ n }] = await app()<{ n: number }[]>`select count(*)::int as n from kickbuy.app_users where role = 'owner'`;
      if (n > 0) return NextResponse.json({ error: "An owner already exists; invite people from the Users page." }, { status: 409 });
      const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "invite", email });
      if (error || !data.user) return NextResponse.json({ error: error?.message ?? "invite failed" }, { status: 500 });
      await app()`
        insert into kickbuy.app_users (user_id, email, role) values (${data.user.id}, ${email}, 'owner')
        on conflict (user_id) do update set role = 'owner', active = true
      `;
      await app()`insert into kickbuy.user_actions (action, detail) values ('users.bootstrap_owner', ${app().json({ email })})`;
      const base = (process.env.APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
      return NextResponse.json({
        email,
        link: `${base}/auth/confirm?token_hash=${data.properties.hashed_token}&type=invite`,
      });
    }

    if (action === "scan") {
      return NextResponse.json(await scanNow({ trigger: "manual", forceFull: true }));
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

async function step(out: Record<string, unknown>, name: string, fn: () => Promise<unknown>) {
  try {
    out[name] = await fn();
  } catch (e) {
    out[name] = { error: e instanceof Error ? e.message : String(e) };
  }
}
