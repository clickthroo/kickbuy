import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { app } from "./db";
import { timed } from "./timed";
import { supabaseServer } from "./supabase/server";

export type Role = "owner" | "buyer" | "viewer";

const RANK: Record<Role, number> = { viewer: 1, buyer: 2, owner: 3 };

export type AppUser = { id: string; email: string; role: Role };

export type SessionState =
  | { kind: "signed-out" }
  | { kind: "needs-mfa" }
  | { kind: "not-authorised"; email: string }
  | { kind: "ok"; user: AppUser };

// Resolves the current request's session. Every check is server-side:
//  1. Supabase validates the session with the Auth server (getUser, not getSession).
//  2. The session must be at AAL2, i.e. the user has passed a TOTP challenge.
//  3. The user must have an active row in kickbuy.app_users.
export const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { kind: "signed-out" };

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    if (aal?.nextLevel === "aal2") {
      // Diagnostic for login loops: which auth cookies arrived (names only).
      const names = (await cookies()).getAll().map((c) => c.name).filter((n) => n.startsWith("sb-"));
      console.info("[auth] needs-mfa", { userId: data.user.id, current: aal?.currentLevel, cookies: names });
    }
    return { kind: "needs-mfa" };
  }

  const rows = await timed(
    "app_users lookup",
    app()<{ email: string; role: Role }[]>`
      select email, role from kickbuy.app_users
      where user_id = ${data.user.id} and active
    `,
  );
  if (rows.length === 0) return { kind: "not-authorised", email: data.user.email ?? "" };
  return { kind: "ok", user: { id: data.user.id, email: rows[0].email, role: rows[0].role } };
});

export async function requireUser(minRole: Role = "viewer"): Promise<AppUser> {
  const state = await getSessionState();
  if (state.kind === "signed-out") redirect("/login");
  if (state.kind === "needs-mfa") redirect("/mfa");
  if (state.kind === "not-authorised") redirect("/not-authorised");
  if (RANK[state.user.role] < RANK[minRole]) redirect("/not-authorised");
  return state.user;
}

export function hasRole(user: AppUser, minRole: Role): boolean {
  return RANK[user.role] >= RANK[minRole];
}

export async function audit(userId: string | null, action: string, detail: Record<string, unknown> = {}) {
  await app()`
    insert into kickbuy.user_actions (user_id, action, detail)
    values (${userId}, ${action}, ${app().json(detail as never)})
  `;
}
