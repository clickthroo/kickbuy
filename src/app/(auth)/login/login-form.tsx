"use client";
import Link from "next/link";
import { useActionState } from "react";
import { PasswordInput } from "@/components/password-input";
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
        <span className="flex items-baseline justify-between gap-2">
          Password
          <Link href="/forgot-password" className="text-xs text-muted underline">
            Forgot password?
          </Link>
        </span>
        <PasswordInput name="password" autoComplete="current-password" required />
      </label>
      {error && <p className="text-sm text-warn">{error}</p>}
      <button className="btn w-full justify-center" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
