import { describe, expect, it } from "vitest";
import { notAFootballShirt, outsideSettings } from "./scope";

const cfs = (slug: string) => `https://www.classicfootballshirts.co.uk/${slug}.html`;
const item = (o: { source_url?: string | null; shirt_type?: string | null; description?: string | null }) => ({
  source_url: null,
  shirt_type: "Home",
  description: null,
  ...o,
});

describe("notAFootballShirt", () => {
  it("flags items whose source URL names something else", () => {
    for (const [url, kind] of [
      [cfs("1996-97-ajax-away-shorts-910-l-ajxsh9697055"), "shorts"],
      [cfs("2022-23-manchester-united-third-shortshe2980-asian"), "shorts"],
      [cfs("2010-11-napoli-third-short-610-xxl-napsh1073430"), "short"],
      [cfs("1990-92-england-home-shirt-shorts-510-xl-engh9078598"), "shorts"],
      [cfs("2007-08-france-rugby-home-shirt-710-xl-frah0773090"), "rugby"],
      [cfs("2015-16-germany-adidas-training-top-510-m-gerj15242337"), "training-top"],
      [cfs("2006-07-england-umbro-training-vest-810-m-engtr06050796"), "vest"],
      [cfs("2024-25-sampdoria-macron-training-tee700039910001"), "tee"],
      [cfs("2009-10-roma-kappa-polo-ls-shirt-1010-s-romtr09132411"), "polo"],
      [cfs("2025-26-liverpool-adidas-originals-crew-sweat-topjz0141"), "sweat"],
      [cfs("2025-26-germany-adidas-originals-125th-anniversary-hooded-topjd7148") + "#sku=JD7148-M", "hooded"],
      [cfs("2009-10-liverpool-away-ls-full-kit-skrtel-37-xl-liva09097588"), "full-kit"],
      ["https://buysellfootballshirts.co.uk/products/2017-18-scotland-training-sweatshirt-pre-match-football-shirt-s", "sweatshirt"],
    ]) {
      expect(notAFootballShirt(item({ source_url: url })), url).toBe(`Not a football shirt: the source listing is "${kind}"`);
    }
  });

  it("reads Classic Football Shirts' product codes", () => {
    expect(notAFootballShirt(item({ source_url: cfs("1998-france-coupe-du-monde-shirt-910-xl-fratr9805771") }))).toBe(
      "Not a football shirt: the shop's product code marks it as training or leisure wear",
    );
    expect(notAFootballShirt(item({ source_url: cfs("2017-18-everton-umbro-training-shirt-810-m-evertr15325131") }))).toMatch(
      /training or leisure wear/,
    );
    expect(notAFootballShirt(item({ source_url: cfs("2012-13-manchester-united-nike-hooded-top-510-m-munj12160135") }))).toMatch(
      /hooded/,
    );
    // Home, away, third, goalkeeper, referee, European, kids' "sh" codes: shirts.
    for (const slug of [
      "2013-14-liverpool-home-shirt-gerrard-8-610-3xl-livh13492624",
      "2019-20-boca-juniors-authentic-away-shirt-l-bcja1984430",
      "2020-21-germany-gk-shirt-910-mboys-gerg20146379",
      "1990s-italy-figc-diadora-referee-ls-shirt-710-l-itar9074940",
      "1997-00-manchester-united-cl-shirt-510-xxl-muncl97094925",
      "2020-21-barcelona-home-shirt-810-lboys-barsh2054542",
    ]) {
      expect(notAFootballShirt(item({ source_url: cfs(slug) })), slug).toBeNull();
    }
  });

  it("uses Kickio's shirt type", () => {
    for (const t of ["Training", "Polo", "Fan", "Supporter", "Leisure", "Pre-Match", "Training Kit", "Hooded Top"]) {
      expect(notAFootballShirt(item({ shirt_type: t })), t).toBe(`Not a football shirt: Kickio lists it as "${t}"`);
    }
    for (const t of ["Home", "Away", "Third", "Fourth", "Goalkeeper", "Referee", "Long-sleeved", null]) {
      expect(notAFootballShirt(item({ shirt_type: t })), String(t)).toBeNull();
    }
  });

  it("uses the description, including HTML-escaped ones", () => {
    expect(notAFootballShirt(item({ description: "Fan shirt produced by Diadora for Italy fans in 1994." }))).toBe(
      'Not a football shirt: the description says "fan shirt"',
    );
    expect(notAFootballShirt(item({ description: "Nottingham Forest adidas polo shirt, medium" }))).toMatch(/polo shirt/);
    expect(notAFootballShirt(item({ description: "Liverpool&#x20;FC&#x20;nike&#x20;t-shirt" }))).toMatch(/t-shirt/);
    expect(notAFootballShirt(item({ description: "Adidas 1/4 zip, black" }))).toMatch(/1\/4 zip/);
  });

  it("spots shorts and shirt-and-shorts sets from the description", () => {
    for (const description of [
      "TEAM - Manchester United SEASON - 2007/09 Home Shorts DETAILS - Original Lextra shorts printing",
      "<p>TEAM - Glasgow Rangers SEASON - 1998/99 Away Shorts &amp; Socks DETAILS</p>",
      "Neal Maupay matchworn/issue Everton FC 2022/23 home kit shorts, medium #20, VGC.",
      "1995-97 Juventus Home Shirt &#x26; Shorts - 8/10 - (M)",
      "1999-01 Ipswich Home Shirt and Shorts - 8/10 - (XL)",
    ]) {
      expect(notAFootballShirt(item({ description })), description).toMatch(/description says/);
    }
  });

  it("keeps real shirts whose description mentions training wear in passing", () => {
    for (const description of [
      "Famously reversible, revealing a navy training shirt on the inside.",
      "Turn the shirt inside out for a navy training shirt!",
      "Atlanta United USA MLS home football shirt 2023 Adidas BNWT",
      "Worn in training and matches. Comes without shorts.",
      "Yellow shorts with black trim and yellow socks complete the kit.",
      "Shirt size - large adult. Shorts - large adult (EU size)",
    ]) {
      expect(notAFootballShirt(item({ description })), description).toBeNull();
    }
  });

  it("keeps football shirts", () => {
    for (const url of [
      cfs("2010-11-england-short-sleeve-shirt-l"),
      cfs("2010-11-england-shortsleeve-shirt-l"),
      cfs("1986-88-sunderland-patrick-reissue-away-shirtsun-retro-012a"),
      "https://www.thekitman.co.uk/product/2010-12-england-home-shirt-l/",
      "https://www.vestel-fc.example/2020-home-shirt",
      "https://rugby-shirts-and-football.example/2020-home-shirt",
      "https://www.ebay.co.uk/itm/800009080846",
    ]) {
      expect(notAFootballShirt(item({ source_url: url })), url).toBeNull();
    }
  });
});

describe("outsideSettings", () => {
  const settings = { listingSizes: ["M", "L", "XL"], worstCondition: "Good" };

  it("keeps medium, large and extra large in Good condition or better", () => {
    for (const size of ["M", "Medium", "L", "Large", "XL", "X-Large", "Extra Large"]) {
      for (const condition of ["Brand New (With Tags)", "Mint", "Very Good", "Good"]) {
        expect(outsideSettings({ size, condition }, settings), `${size} ${condition}`).toBeNull();
      }
    }
  });

  it("leaves out Fair and worse", () => {
    expect(outsideSettings({ size: "L", condition: "Fair" }, settings)).toBe("Outside your settings: condition is Fair");
    expect(outsideSettings({ size: "L", condition: "Needs Attention" }, settings)).toMatch(/Needs Attention/);
  });

  it("leaves out other sizes, kids' sizes and unreadable sizes", () => {
    expect(outsideSettings({ size: "S", condition: "Good" }, settings)).toBe("Outside your settings: size S");
    expect(outsideSettings({ size: "XXL", condition: "Good" }, settings)).toMatch(/size XXL/);
    expect(outsideSettings({ size: "XL Boys", condition: "Good" }, settings)).toBe("Outside your settings: size XL Boys (kids)");
    expect(outsideSettings({ size: "S, XXL", condition: "Good" }, settings)).toMatch(/size S, XXL/);
    expect(outsideSettings({ size: "13-14 Years", condition: "Good" }, settings)).toMatch(/\(kids\)/);
    expect(outsideSettings({ size: null, condition: "Good" }, settings)).toBe("Outside your settings: size not given");
  });

  it("reads adult labels and multi-size stock", () => {
    for (const size of ["Medium adult", "XL adult", "Large Adult", "M, L", "S, M", "L/XL", "M, L, XL, XXL", "Mens L"]) {
      expect(outsideSettings({ size, condition: "Good" }, settings), size).toBeNull();
    }
    expect(outsideSettings({ size: "XXL (2XL)", condition: "Good" }, settings)).toMatch(/XXL/);
  });

  it("leaves out excluded shops, ignoring stray spaces", () => {
    const s = { ...settings, excludedListingSources: ["Classic Football Shirts", "Retro shirts"] };
    expect(outsideSettings({ size: "L", condition: "Good", source_name: "Classic Football Shirts" }, s)).toBe(
      "Outside your settings: listed by Classic Football Shirts",
    );
    expect(outsideSettings({ size: "L", condition: "Good", source_name: "Retro shirts " }, s)).toMatch(/Retro shirts/);
    expect(outsideSettings({ size: "L", condition: "Good", source_name: "TheKitMan" }, s)).toBeNull();
    expect(outsideSettings({ size: "L", condition: "Good", source_name: null }, s)).toBeNull();
  });

  it("applies no restriction when the settings are cleared", () => {
    expect(outsideSettings({ size: "XS Kids", condition: "Needs Attention" }, { listingSizes: null, worstCondition: null })).toBeNull();
  });
});
