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
      <p className="mt-4 text-xs text-muted">Next you&apos;ll set up an authenticator app for two-step verification.</p>
    </AuthShell>
  );
}
