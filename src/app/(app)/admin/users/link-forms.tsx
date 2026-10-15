"use client";
import { useActionState } from "react";
import { inviteUser, type LinkResult, resetLogin } from "./actions";

function LinkNotice({ state }: { state: LinkResult }) {
  if (!state) return null;
  if (state.error) return <p className="w-full text-sm text-warn">{state.error}</p>;
  return (
    <div className="w-full rounded-md bg-warn-bg p-3 text-sm">
      <p className="text-warn">
        Send this one-time link to {state.email} privately. It works once and expires (1 hour by default). It
        won&apos;t be shown again.
      </p>
      <input readOnly value={state.link} className="input mt-2 font-mono text-xs" onFocus={(e) => e.target.select()} />
    </div>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteUser, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 text-sm">
      <label className="min-w-56 flex-1">
        Email
        <input name="email" type="email" required className="input mt-1" />
      </label>
      <label>
        Role
        <select name="role" defaultValue="buyer" className="input mt-1">
          <option value="buyer">Buyer: view, watch and dismiss opportunities, run scans</option>
          <option value="viewer">Viewer: read-only</option>
          <option value="owner">Owner: everything, including users</option>
        </select>
      </label>
      <button className="btn" disabled={pending}>
        {pending ? "Creating…" : "Create invite link"}
      </button>
      <LinkNotice state={state} />
    </form>
  );
}

export function ResetLoginForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetLogin, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <button className="btn btn-secondary py-1 text-xs" disabled={pending}>
        Reset login
      </button>
      <LinkNotice state={state} />
    </form>
  );
}
