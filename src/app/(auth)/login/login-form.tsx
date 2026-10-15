"use client";
import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        Email
        <input name="email" type="email" autoComplete="username" required className="input mt-1" />
      </label>
      <label className="block text-sm">
        Password
        <input name="password" type="password" autoComplete="current-password" required className="input mt-1" />
      </label>
      {error && <p className="text-sm text-warn">{error}</p>}
      <button className="btn w-full justify-center" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
