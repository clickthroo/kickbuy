import { AuthShell } from "@/components/auth-shell";

export default function NotAuthorisedPage() {
  return (
    <AuthShell title="No access">
      <p className="text-sm">
        You&apos;re signed in, but this account doesn&apos;t have access to this part of KickBuy. Ask an owner to
        check your role.
      </p>
      <form action="/auth/sign-out" method="post" className="mt-5">
        <button className="btn btn-secondary">Sign out</button>
      </form>
    </AuthShell>
  );
}
