import { describe, expect, it } from "vitest";
import { sale } from "./fixtures";
import { trustedSales, untrustedSales } from "./sale-quality";

const tsa = (slug: string) => `https://thesoccerarchive.com/products/${slug}`;

describe("untrustedSales", () => {
  it("drops a burst of crawled sales from one shop in one hour", () => {
    const burst = Array.from({ length: 10 }, (_, i) =>
      sale({ sale_id: `b${i}`, source: "kickcrawl", sale_url: tsa(`shirt-${i}`), sold_at: new Date(`2026-11-26T22:0${i}:00Z`) }),
    );
    const other = sale({ sale_id: "ok", source: "kickcrawl", sale_url: tsa("shirt-x"), sold_at: new Date("2026-11-26T23:30:00Z") });
    const bad = untrustedSales([...burst, other]);
    expect(bad.size).toBe(10);
    expect(bad.get("b0")).toBe('one of 10 "sales" from thesoccerarchive.com in the same hour');
    expect(trustedSales([...burst, other]).map((s) => s.sale_id)).toEqual(["ok"]);
  });

  it("keeps nine in an hour, and doesn't count other shops or sources together", () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      sale({ sale_id: `n${i}`, source: "kickcrawl", sale_url: tsa(`shirt-${i}`), sold_at: new Date("2026-11-26T22:10:00Z") }),
    );
    const elsewhere = sale({ sale_id: "e", source: "kickcrawl", sale_url: "https://cultkits.com/products/a", sold_at: new Date("2026-11-26T22:10:00Z") });
    const cfs = Array.from({ length: 12 }, (_, i) =>
      sale({ sale_id: `c${i}`, source: "cfs", sale_url: `https://www.classicfootballshirts.co.uk/x-${i}.html`, sold_at: new Date("2026-11-26T00:10:00Z") }),
    );
    expect(untrustedSales([...nine, elsewhere, ...cfs]).size).toBe(0);
  });

  it("drops every sale of a shop item that 'sold' more than once, except on eBay, Vinted and Kickio", () => {
    const url = tsa("arsenal-2006-08-home-shirt-henry-14-8-10");
    const twice = [
      sale({ sale_id: "t1", source: "kickcrawl", sale_url: url, sold_at: new Date("2026-11-04T19:20:00Z") }),
      sale({ sale_id: "t2", source: "kickcrawl", sale_url: `${url}/`, sold_at: new Date("2026-11-26T22:10:00Z") }),
    ];
    expect([...untrustedSales(twice).values()]).toEqual(['the same item "sold" 2 times', 'the same item "sold" 2 times']);
    const ebay = [
      sale({ sale_id: "e1", source: "ebay", sale_url: "https://www.ebay.co.uk/itm/1" }),
      sale({ sale_id: "e2", source: "ebay", sale_url: "https://www.ebay.co.uk/itm/1" }),
    ];
    expect(untrustedSales(ebay).size).toBe(0);
  });

  it("drops sales of things that aren't football shirts", () => {
    const jacket = sale({ sale_id: "j", source: "kickcrawl", sale_url: tsa("ac-milan-1993-94-track-jacket-xl") });
    expect(untrustedSales([jacket]).get("j")).toMatch(/Not a football shirt/);
  });
});
