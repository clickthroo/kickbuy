"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { audit, type Role, requireUser } from "@/lib/auth";
import { app } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/server";

const ROLES: Role[] = ["owner", "buyer", "viewer"];
const UUID = /^[0-9a-f-]{36}$/i;

export type LinkResult = { error?: string; link?: string; email?: string } | null;

async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// Invite links are generated here and handed to the owner to pass on, so
// KickBuy doesn't depend on Supabase's email templates or SMTP setup.
export async function inviteUser(_prev: LinkResult, form: FormData): Promise<LinkResult> {
  const owner = await requireUser("owner");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "") as Role;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email." };
  if (!ROLES.includes(role)) return { error: "Choose a role." };

  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "invite", email });
  if (error || !data.user) return { error: error?.message ?? "Could not create the invite." };

  await app()`
    insert into kickbuy.app_users (user_id, email, role, created_by)
    values (${data.user.id}, ${email}, ${role}, ${owner.id})
    on conflict (user_id) do update set role = excluded.role, active = true
  `;
  await audit(owner.id, "users.invite", { email, role, userId: data.user.id });
  revalidatePath("/admin/users");
  const link = `${await appOrigin()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=invite`;
  return { link, email };
}

// Clears the user's authenticator and issues a one-time link to set a new
// password; they enrol a new authenticator on next sign-in.
export async function resetLogin(_prev: LinkResult, form: FormData): Promise<LinkResult> {
  const owner = await requireUser("owner");
  const userId = String(form.get("userId") ?? "");
  if (!UUID.test(userId)) return { error: "Unknown user." };
  const [row] = await app()<{ email: string }[]>`
    select email from kickbuy.app_users where user_id = ${userId}
  `;
  if (!row) return { error: "Unknown user." };

  const admin = supabaseAdmin();
  const factors = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of factors.data?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: row.email });
  if (error) return { error: error.message };
  await audit(owner.id, "users.reset_login", { userId, email: row.email });
  const link = `${await appOrigin()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery`;
  return { link, email: row.email };
}

export async function updateUser(form: FormData) {
  const owner = await requireUser("owner");
  const userId = String(form.get("userId") ?? "");
  const role = String(form.get("role") ?? "") as Role;
  const active = form.get("active") === "on";
  if (!UUID.test(userId) || !ROLES.includes(role)) return;
  if (userId === owner.id && (role !== "owner" || !active)) return; // can't lock yourself out

  await app()`
    update kickbuy.app_users set role = ${role}, active = ${active} where user_id = ${userId}
  `;
  // A ban stops the user refreshing their session; the active flag already
  // blocks every request.
  await supabaseAdmin().auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  await audit(owner.id, "users.update", { userId, role, active });
  revalidatePath("/admin/users");
}
