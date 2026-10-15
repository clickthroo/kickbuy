"use client";
import { useActionState } from "react";
import { runScanAction } from "@/app/(app)/scans/actions";

export function RunScanButton({ full = false, label }: { full?: boolean; label?: string }) {
  const [state, action, pending] = useActionState(runScanAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {full && <input type="hidden" name="full" value="1" />}
      <button className={full ? "btn btn-secondary" : "btn"} disabled={pending}>
        {pending ? "Scanning…" : (label ?? (full ? "Full rescan" : "Scan now"))}
      </button>
      {state && <span className={`text-sm ${state.ok ? "text-muted" : "text-warn"}`}>{state.message}</span>}
    </form>
  );
}
