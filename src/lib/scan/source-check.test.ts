import { describe, expect, it } from "vitest";
import { titleSaysNotAShirt } from "../engine/scope";
import { OPAQUE_SOURCE, readSourcePage } from "./source-check";

const ebay = "https://www.ebay.co.uk/itm/880111905556";

describe("readSourcePage", () => {
  it("reads the eBay title and strips the site name", () => {
    const html = `<html><head><title>Chelsea Football Shirt 2015/2016 Training Excellent Mens Large Genuine | eBay</title></head></html>`;
    expect(readSourcePage(ebay, html)).toEqual({ title: "Chelsea Football Shirt 2015/2016 Training Excellent Mens Large Genuine", ended: false });
  });

  it("prefers og:title and decodes entities", () => {
    const html = `<meta property="og:title" content="Arsenal 2004&#x2F;05 Home Shirt &amp; Bag"><title>other</title>`;
    expect(readSourcePage(ebay, html).title).toBe("Arsenal 2004/05 Home Shirt & Bag");
  });

  it("spots an ended eBay listing", () => {
    const html = `<title>Liverpool Home Shirt | eBay</title><div>This listing was ended by the seller because the item is no longer available.</div>`;
    expect(readSourcePage(ebay, html).ended).toBe(true);
  });

  it("refuses a bot check page", () => {
    expect(() => readSourcePage(ebay, "<title>Pardon Our Interruption...</title>")).toThrow(/bot check/);
  });
});

describe("titleSaysNotAShirt", () => {
  it("flags training tops and other non-shirts from the shop's title", () => {
    expect(titleSaysNotAShirt("Chelsea Football Shirt 2015/2016 Training Excellent Mens Large Genuine")).toBe(
      'Not a football shirt: the shop\'s title says "training"',
    );
    for (const t of ["Liverpool Polo Shirt Adidas", "Man Utd 1990s Track Top", "Arsenal Pre-Match Shirt 2019", "England Fan Version Shirt", "Leeds Home Shorts Large"]) {
      expect(titleSaysNotAShirt(t), t).toMatch(/Not a football shirt/);
    }
  });

  it("keeps match shirts", () => {
    for (const t of ["Chelsea Football Shirt 2015/2016 Home Adidas Large", "England 2002 Reversible Home Shirt (Training Side Inside)", "Celtic 1990s Away Shirt Umbro", null]) {
      expect(titleSaysNotAShirt(t), String(t)).toBeNull();
    }
  });
});

describe("OPAQUE_SOURCE", () => {
  it("covers eBay and Vinted item pages only", () => {
    expect(OPAQUE_SOURCE.test(ebay)).toBe(true);
    expect(OPAQUE_SOURCE.test("https://www.vinted.co.uk/items/9186267441")).toBe(true);
    expect(OPAQUE_SOURCE.test("https://www.classicfootballshirts.co.uk/x.html")).toBe(false);
  });
});
