export function money(pence: number | null | undefined, currency = "GBP"): string {
  if (pence === null || pence === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(pence / 100);
}

export function pct(value: number | string | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

const LONDON = "Europe/London";

export function date(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: LONDON });
}

export function dateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: LONDON });
}

export function ago(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return "never";
  const s = Math.round((now.getTime() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function age(d: Date | string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30.44);
  return months < 24 ? `${months} months ago` : `${Math.floor(months / 12)} years ago`;
}
