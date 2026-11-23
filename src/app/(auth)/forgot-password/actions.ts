"use server";
import { audit } from "@/lib/auth";
import { appOrigin } from "@/lib/origin";
import { supabaseServer } from "@/lib/supabase/server";

export type ResetResult = { ok: boolean; message: string } | null;

// Emails a password-reset link. The reply is the same whether or not the
// address has an account, so it can't be used to find out who does.
export async function requestPasswordReset(_prev: ResetResult, form: FormData): Promise<ResetResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Enter a valid email." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await appOrigin()}/auth/confirm` });
  await audit(null, "auth.reset_requested", { email, ...(error ? { error: error.message } : {}) });
  if (error?.status === 429) return { ok: false, message: "Too many reset requests. Try again in an hour." };
  return {
    ok: true,
    message:
      "If that email has a KickBuy account, a reset link is on its way. Open it on this device and browser, within an hour.",
  };
}
