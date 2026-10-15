"use server";
import { redirect } from "next/navigation";
import { audit } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

// Verifies the TOTP code on the server, so the upgraded (AAL2) session is
// written as Set-Cookie headers on the same response that redirects to the
// app, rather than by browser JavaScript before a client-side navigation.
export async function verifyMfa(factorId: string, code: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(factorId) || !/^\d{6}$/.test(code)) return "Enter the 6-digit code.";
  const supabase = await supabaseServer();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/login");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    await audit(user.user.id, "auth.mfa_failed", { reason: error.message });
    return "That code didn't work. Check your authenticator app and try again.";
  }
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    console.warn("[mfa] verified but session is still", aal?.currentLevel);
    return "Your code was accepted but the session didn't upgrade. Sign out, sign in again and retry.";
  }
  await audit(user.user.id, "auth.mfa_ok", {});
  redirect("/");
}
