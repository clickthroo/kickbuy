import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getSessionState } from "@/lib/auth";
import { ForgotPasswordForm } from "./form";

export default async function ForgotPasswordPage() {
  const state = await getSessionState();
  if (state.kind === "ok") redirect("/");
  return (
    <AuthShell title="Reset your password">
      <p className="mb-4 text-sm text-muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <ForgotPasswordForm />
      <p className="mt-4 text-xs text-muted">
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
        . You&apos;ll still confirm with your authenticator app afterwards.
      </p>
    </AuthShell>
  );
}
