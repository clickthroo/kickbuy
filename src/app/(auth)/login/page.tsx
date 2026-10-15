import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getSessionState } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const state = await getSessionState();
  if (state.kind === "ok") redirect("/");
  if (state.kind === "needs-mfa") redirect("/mfa");
  const { link } = await searchParams;
  return (
    <AuthShell title="Sign in">
      {link === "invalid" && (
        <p className="mb-4 rounded bg-warn-bg p-2 text-sm text-warn">
          That link has expired or was already used. Ask an owner for a new one.
        </p>
      )}
      <LoginForm />
      <p className="mt-4 text-xs text-muted">
        Access is by invitation. Ask a KickBuy owner if you need an account or a password reset.
      </p>
    </AuthShell>
  );
}
