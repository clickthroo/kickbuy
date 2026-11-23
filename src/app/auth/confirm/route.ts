import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Landing point for invite and password-reset links. Links generated on the
// Users page carry a one-time token hash; "Forgot password?" emails come back
// from Supabase with a code for the browser that asked. Either way, start a
// session and send the user to choose a password.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const target = request.nextUrl.clone();
  target.search = "";

  const supabase = await supabaseServer();
  let ok = false;
  if (tokenHash && (type === "invite" || type === "recovery")) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }
  if (ok) {
    target.pathname = "/set-password";
    return NextResponse.redirect(target);
  }
  target.pathname = "/login";
  target.searchParams.set("link", "invalid");
  return NextResponse.redirect(target);
}
