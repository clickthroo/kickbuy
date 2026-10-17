import { describe, expect, it } from "vitest";
import { notAFootballShirt } from "./scope";

const cfs = (slug: string) => `https://www.classicfootballshirts.co.uk/${slug}.html`;

describe("notAFootballShirt", () => {
  it("flags items that aren't a single football shirt", () => {
    for (const [url, kind] of [
      [cfs("1996-97-ajax-away-shorts-910-l-ajxsh9697055"), "shorts"],
      [cfs("2022-23-manchester-united-third-shortshe2980-asian"), "shorts"],
      [cfs("1990-92-england-home-shirt-shorts-510-xl-engh9078598"), "shorts"],
      [cfs("2007-08-france-rugby-home-shirt-710-xl-frah0773090"), "rugby"],
      [cfs("2015-16-germany-adidas-training-top-510-m-gerj15242337"), "training-top"],
      [cfs("2006-07-england-umbro-training-vest-810-m-engtr06050796"), "vest"],
      [cfs("2024-25-sampdoria-macron-training-tee700039910001"), "tee"],
      [cfs("2009-10-roma-kappa-polo-ls-shirt-1010-s-romtr09132411"), "polo"],
      ["https://buysellfootballshirts.co.uk/products/2017-18-scotland-training-sweatshirt-pre-match-football-shirt-s", "sweatshirt"],
    ]) {
      expect(notAFootballShirt(url), url).toBe(`Not a football shirt: the source listing is "${kind}"`);
    }
  });

  it("keeps football shirts", () => {
    for (const url of [
      cfs("2013-14-liverpool-home-shirt-gerrard-8-610-3xl-livh13492624"),
      cfs("2020-21-germany-gk-shirt-910-mboys-gerg20146379"),
      cfs("2010-11-england-short-sleeve-shirt-l"),
      cfs("2010-11-england-shortsleeve-shirt-l"),
      cfs("1986-88-sunderland-patrick-reissue-away-shirtsun-retro-012a"),
      "https://www.thekitman.co.uk/product/2010-12-england-training-shirt-l/",
      "https://www.vestel-fc.example/2020-home-shirt",
      null,
    ]) {
      expect(notAFootballShirt(url), String(url)).toBeNull();
    }
  });

  it("ignores the shop's domain", () => {
    expect(notAFootballShirt("https://rugby-shirts-and-football.example/2020-home-shirt")).toBeNull();
  });
});
