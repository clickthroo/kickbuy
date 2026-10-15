"use server";
import { redirect } from "next/navigation";
import { audit } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return "Enter your email and password.";

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await audit(null, "auth.sign_in_failed", { email });
    return "Those details didn't match.";
  }
  await audit(data.user.id, "auth.password_ok", {});
  redirect("/mfa");
}
