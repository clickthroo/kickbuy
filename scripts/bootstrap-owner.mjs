// Creates the first KickBuy owner and prints a one-time invite link.
//
//   APP_URL=https://… NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
//   KICKBUY_DATABASE_URL=… node scripts/bootstrap-owner.mjs owner@example.com
//
// After that, owners invite everyone else from the Users page.
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("usage: node scripts/bootstrap-owner.mjs <email>");
  process.exit(1);
}
for (const k of ["APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "KICKBUY_DATABASE_URL"]) {
  if (!process.env[k]) {
    console.error(`missing ${k}`);
    process.exit(1);
  }
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
if (error) {
  console.error(error.message);
  process.exit(1);
}

const sql = postgres(process.env.KICKBUY_DATABASE_URL, { prepare: false, max: 1 });
await sql`
  insert into kickbuy.app_users (user_id, email, role)
  values (${data.user.id}, ${email}, 'owner')
  on conflict (user_id) do update set role = 'owner', active = true
`;
await sql`insert into kickbuy.user_actions (action, detail) values ('users.bootstrap_owner', ${sql.json({ email })})`;
await sql.end();

const base = process.env.APP_URL.replace(/\/$/, "");
console.log(`${base}/auth/confirm?token_hash=${data.properties.hashed_token}&type=invite`);
