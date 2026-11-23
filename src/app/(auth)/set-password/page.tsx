import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getSessionState } from "@/lib/auth";
import { SetPasswordForm } from "./form";

export default async function SetPasswordPage() {
  const state = await getSessionState();
  if (state.kind === "signed-out") redirect("/login");
  return (
    <AuthShell title="Choose a password">
      <SetPasswordForm />
      <p className="mt-4 text-xs text-muted">Next you&apos;ll confirm with your authenticator app, or set one up if this is a new account.</p>
    </AuthShell>
  );
}
