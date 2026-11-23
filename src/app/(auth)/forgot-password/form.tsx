"use client";
import { useActionState } from "react";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [result, action, pending] = useActionState(requestPasswordReset, null);
  if (result?.ok) return <p className="rounded bg-good-bg p-2 text-sm text-good">{result.message}</p>;
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        Email
        <input name="email" type="email" autoComplete="username" required className="input mt-1" />
      </label>
      {result && <p className="text-sm text-warn">{result.message}</p>}
      <button className="btn w-full justify-center" disabled={pending}>
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
