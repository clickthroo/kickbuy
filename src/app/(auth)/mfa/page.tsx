import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getSessionState } from "@/lib/auth";
import { MfaForm } from "./mfa-form";

export default async function MfaPage() {
  const state = await getSessionState();
  if (state.kind === "signed-out") redirect("/login");
  if (state.kind === "ok") redirect("/");
  if (state.kind === "not-authorised") redirect("/not-authorised");
  return (
    <AuthShell title="Two-step verification">
      <MfaForm />
    </AuthShell>
  );
}
