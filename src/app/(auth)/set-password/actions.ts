"use server";
import { redirect } from "next/navigation";
import { audit } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function setPassword(_prev: string | null, form: FormData): Promise<string | null> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 12) return "Use at least 12 characters.";
  if (password !== confirm) return "The passwords don't match.";

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return error.message;
  await audit(data.user.id, "auth.password_set", {});
  redirect("/mfa");
}
