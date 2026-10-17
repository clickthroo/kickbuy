import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { hasRole, requireUser } from "@/lib/auth";
import { unreadAlertCount } from "@/lib/data/alerts";
import { timed } from "@/lib/timed";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const unread = await timed("unreadAlertCount", unreadAlertCount(user.id));
  const items = [
    { href: "/", label: "Opportunities" },
    { href: "/alerts", label: "Alerts", badge: unread },
    { href: "/scans", label: "Scans" },
    { href: "/settings", label: "Settings" },
    ...(hasRole(user, "owner") ? [{ href: "/admin/users", label: "Users" }] : []),
  ];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 px-4 py-1.5 md:py-3">
          <Link href="/" className="py-2 font-semibold md:py-0">
            KickBuy
          </Link>
          <AppNav items={items} account={`${user.email} · ${user.role}`} />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pt-6">{children}</main>
    </div>
  );
}
