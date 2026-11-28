"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { removeOpportunity } from "@/app/(app)/opportunities/actions";

// Removing is meant to be permanent (an owner can restore it from the detail
// page link, but it won't show anywhere in the app again), so it takes two
// taps: the X, then Remove. The second step is on the page rather than a
// browser dialog, which phones can suppress or make easy to miss.
export function RemoveButton({ id, title, from, className }: { id: string; title: string; from?: "detail"; className?: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className={
          className ??
          "inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-warn-bg hover:text-warn active:bg-warn-bg md:h-8 md:w-8"
        }
        aria-label={`Remove ${title} permanently`}
        title="Remove permanently"
        onClick={() => setConfirming(true)}
      >
        {from ? (
          "Remove permanently"
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 md:h-5 md:w-5" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <form
      action={removeOpportunity}
      className={`flex items-center gap-1 ${from ? "" : "rounded-lg border border-border bg-surface p-1 shadow-sm"}`}
    >
      <input type="hidden" name="id" value={id} />
      {from && <input type="hidden" name="from" value={from} />}
      <ConfirmButton />
      <button type="button" className="btn btn-secondary h-11 md:h-8" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      // Focused when it appears, so a keyboard user lands on the next step.
      autoFocus
      className="btn h-11 border-warn! bg-warn! text-white! md:h-8"
      disabled={pending}
      title="Removes it for good: it won't come back, even if the price drops"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
