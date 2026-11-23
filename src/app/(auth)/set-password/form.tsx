"use client";
import { useActionState } from "react";
import { PasswordInput } from "@/components/password-input";
import { setPassword } from "./actions";

export function SetPasswordForm() {
  const [error, action, pending] = useActionState(setPassword, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        New password
        <PasswordInput name="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="block text-sm">
        Confirm password
        <PasswordInput name="confirm" autoComplete="new-password" minLength={12} required />
      </label>
      {error && <p className="text-sm text-warn">{error}</p>}
      <button className="btn w-full justify-center" disabled={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
