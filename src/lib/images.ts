// Kickio's own image storage is first party; anything else (shop CDNs) is
// fetched through KickBuy's /api/img proxy so the shop never sees who is
// looking, or from where.
const FIRST_PARTY_IMAGE_HOSTS = new Set(["rlveellvebfzgyobceru.supabase.co"]);

export function displayImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (FIRST_PARTY_IMAGE_HOSTS.has(u.hostname)) return url;
    return `/api/img?u=${encodeURIComponent(url)}`;
  } catch {
    return null;
  }
}
