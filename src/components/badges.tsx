import type { Confidence } from "@/lib/engine/match";
import type { OpportunityStatus } from "@/lib/scan/lifecycle";

export function StatusBadge({ status }: { status: OpportunityStatus }) {
  const cls = status === "new" ? "badge badge-good" : status === "watching" ? "badge badge-warn" : "badge";
  const label = { new: "New", watching: "Watching", dismissed: "Dismissed", expired: "Expired" }[status];
  return <span className={cls}>{label}</span>;
}

export function PreLiveBadge() {
  return (
    <span className="badge badge-prelive" title="In Kickio's review queue: not yet visible to buyers">
      Pre-live opportunity
    </span>
  );
}

export function ConfidenceBadge({ confidence, needsReview }: { confidence: Confidence; needsReview?: boolean }) {
  const label = { high: "High", medium: "Medium", low: "Low" }[confidence];
  return (
    <span
      className={confidence === "high" ? "badge badge-good" : confidence === "low" ? "badge badge-warn" : "badge"}
      title={needsReview ? "Uncertain match: check it by hand before acting" : undefined}
    >
      {label}
      {needsReview && " · review"}
    </span>
  );
}

export function StaleBadge() {
  return (
    <span className="badge badge-warn" title="The reference sale is older than the configured maximum age">
      Stale sale
    </span>
  );
}
