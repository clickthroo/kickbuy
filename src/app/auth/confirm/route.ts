import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Landing point for invite and password-reset links generated on the Users
// page. Verifies the one-time token and starts a session, then sends the user
// to choose a password.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const target = request.nextUrl.clone();
  target.search = "";

  if (tokenHash && (type === "invite" || type === "recovery")) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      target.pathname = "/set-password";
      return NextResponse.redirect(target);
    }
  }
  target.pathname = "/login";
  target.searchParams.set("link", "invalid");
  return NextResponse.redirect(target);
}
