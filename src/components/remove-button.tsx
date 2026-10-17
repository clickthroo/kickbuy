"use client";
import { removeOpportunity } from "@/app/(app)/opportunities/actions";

// Asks first: removing is meant to be permanent (an owner can restore it from
// the detail page link, but it won't show anywhere in the app again).
export function RemoveButton({ id, title, from, className }: { id: string; title: string; from?: "detail"; className?: string }) {
  return (
    <form
      action={removeOpportunity}
      onSubmit={(e) => {
        if (!window.confirm(`Remove "${title}" from KickBuy for good? It won't be shown again, even if the price drops.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      {from && <input type="hidden" name="from" value={from} />}
      <button
        className={className ?? "rounded p-1 text-muted hover:bg-warn-bg hover:text-warn"}
        aria-label={`Remove ${title} permanently`}
        title="Remove permanently"
      >
        {from ? (
          "Remove permanently"
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        )}
      </button>
    </form>
  );
}
