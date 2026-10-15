"use client";
import { useActionState } from "react";
import { setPassword } from "./actions";

export function SetPasswordForm() {
  const [error, action, pending] = useActionState(setPassword, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={12} required className="input mt-1" />
      </label>
      <label className="block text-sm">
        Confirm password
        <input name="confirm" type="password" autoComplete="new-password" minLength={12} required className="input mt-1" />
      </label>
      {error && <p className="text-sm text-warn">{error}</p>}
      <button className="btn w-full justify-center" disabled={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
