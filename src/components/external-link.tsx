import type { AnchorHTMLAttributes } from "react";

// Every link out of KickBuy goes through this: new tab, no Referer header
// (rel + referrerPolicy, on top of the site-wide Referrer-Policy), and no
// window.opener for the destination page.
export function ExternalLink({
  href,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel" | "referrerPolicy"> & { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" {...rest}>
      {children}
    </a>
  );
}
