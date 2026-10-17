"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; badge?: number };

// Inline links on wider screens; a menu button that opens a panel on phones.
export function AppNav({ items, account }: { items: Item[]; account: string }) {
  const pathname = usePathname();
  // Remembers which page the menu was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/opportunities") : pathname.startsWith(href);
  const unread = items.find((i) => i.badge)?.badge ?? 0;

  return (
    <>
      <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Main">
        {items.map((i) => (
          <NavLink key={i.href} item={i} active={isActive(i.href)} className="rounded px-2.5 py-1.5" />
        ))}
      </nav>
      <div className="ml-auto hidden items-center gap-3 text-sm text-muted md:flex">
        <span className="max-w-56 truncate" title={account}>
          {account}
        </span>
        <SignOut className="hover:text-foreground" />
      </div>

      <button
        type="button"
        className="relative -mr-2 ml-auto inline-flex h-11 w-11 items-center justify-center rounded md:hidden"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : unread ? `Open menu, ${unread} unread alerts` : "Open menu"}
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        {!open && unread > 0 && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-good" aria-hidden="true" />}
      </button>
      {open && (
        <div id="mobile-nav" className="basis-full border-t border-border pt-2 pb-1 md:hidden">
          <nav className="flex flex-col text-base" aria-label="Main">
            {items.map((i) => (
              <NavLink key={i.href} item={i} active={isActive(i.href)} className="-mx-2 rounded px-2 py-3" />
            ))}
          </nav>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted">
            <span className="min-w-0 truncate">{account}</span>
            <SignOut className="btn btn-secondary shrink-0 whitespace-nowrap" />
          </div>
        </div>
      )}
    </>
  );
}

function NavLink({ item, active, className }: { item: Item; active: boolean; className: string }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${className} flex items-center ${
        active ? "bg-background font-medium text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      {item.label}
      {item.badge ? (
        <span className="badge badge-good ml-1.5" aria-label={`${item.badge} unread`}>
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function SignOut({ className }: { className: string }) {
  return (
    <form action="/auth/sign-out" method="post">
      <button className={className}>Sign out</button>
    </form>
  );
}
