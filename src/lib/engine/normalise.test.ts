import { describe, expect, it } from "vitest";
import { canonicalCondition, namesetFromUrl, normaliseManufacturer, normaliseNumber, normalisePlayer, normaliseSeason, normaliseSize, playerKey } from "./normalise";

describe("canonicalCondition", () => {
  it("accepts Kickio grades in any case", () => {
    expect(canonicalCondition("very good")).toBe("Very Good");
    expect(canonicalCondition(" Brand New (With Tags) ")).toBe("Brand New (With Tags)");
  });
  it("refuses anything that isn't a grade rather than guessing", () => {
    expect(canonicalCondition("Excelllent")).toBeNull();
    expect(canonicalCondition("Excellent")).toBeNull();
    expect(canonicalCondition("Removed!")).toBeNull();
    expect(canonicalCondition(null)).toBeNull();
  });
});

describe("normaliseSeason", () => {
  it("reads the common spellings of a season", () => {
    expect(normaliseSeason("1997-98")).toBe("1997-98");
    expect(normaliseSeason("1997/98")).toBe("1997-98");
    expect(normaliseSeason("97/98")).toBe("1997-98");
    expect(normaliseSeason("1999-2000")).toBe("1999-00");
    expect(normaliseSeason("2003-05")).toBe("2003-05");
    expect(normaliseSeason("2010")).toBe("2010");
  });
});

describe("normaliseSize", () => {
  it("maps adult words to letters", () => {
    expect(normaliseSize("Large")).toEqual({ key: "L", band: "adult" });
    expect(normaliseSize("xl")).toEqual({ key: "XL", band: "adult" });
    expect(normaliseSize("XXXL")).toEqual({ key: "3XL", band: "adult" });
  });
  it("separates kids' sizes", () => {
    expect(normaliseSize("13-14 Years")).toEqual({ key: "13-14Y", band: "kids" });
    expect(normaliseSize("Kids, 13-14Y")).toEqual({ key: "13-14Y", band: "kids" });
    expect(normaliseSize("XL.Boys")).toEqual({ key: "XL KIDS", band: "kids" });
  });
  it("keeps ambiguous sizes unknown", () => {
    expect(normaliseSize("M, L")).toEqual({ key: null, band: "adult" });
    expect(normaliseSize(null)).toEqual({ key: null, band: null });
  });
});

describe("other attributes", () => {
  it("ignores accents and punctuation in player names", () => {
    expect(normalisePlayer("Di María")).toBe(normalisePlayer("di maria"));
  });
  it("normalises shirt numbers", () => {
    expect(normaliseNumber("#07")).toBe("7");
  });
  it("treats 'Other' manufacturer as unknown", () => {
    expect(normaliseManufacturer("Other")).toBeNull();
    expect(normaliseManufacturer("Umbro")).toBe("umbro");
  });
});

describe("playerKey", () => {
  it("compares by surname", () => {
    for (const n of ["Steven Gerrard", "Gerrard", "S Gerrard", "Liverpool Gerrard"]) expect(playerKey(n), n).toBe("gerrard");
    expect(playerKey("Zlatan Ibrahimović")).toBe("ibrahimovic");
    expect(playerKey(null)).toBeNull();
    expect(playerKey("  ")).toBeNull();
  });
});

describe("namesetFromUrl", () => {
  it("reads a printed name and number from shop product URLs", () => {
    expect(namesetFromUrl("https://thesoccerarchive.com/products/liverpool-2008-09-third-shirt-gerrard-8-8-11")).toEqual({ player: "gerrard", number: "8" });
    expect(namesetFromUrl("https://thesoccerarchive.com/products/arsenal-2006-08-home-shirt-henry-14-8-10")).toEqual({ player: "henry", number: "14" });
    expect(namesetFromUrl("https://www.classicfootballshirts.co.uk/2013-14-liverpool-home-shirt-gerrard-8-610-3xl-livh13492624.html")).toEqual({
      player: "gerrard",
      number: "8",
    });
    expect(namesetFromUrl("https://www.footballfinery.co.uk/products/2008-09-watford-home-football-shirt-l-diadora-8-eustace-ff301925")).toEqual({
      player: "eustace",
      number: "8",
    });
    expect(namesetFromUrl("https://example.com/products/newcastle-1996-97-home-shirt-shearer-9-10-10")).toEqual({ player: "shearer", number: "9" });
  });

  it("finds nothing on plain shirts, grades, sizes, seasons and non-shop URLs", () => {
    for (const url of [
      "https://thesoccerarchive.com/products/liverpool-2008-09-third-shirt-8-10",
      "https://www.vintagefootballshirts.com/products/1986-87-liverpool-adidas-away-shirt-m-46821",
      "https://www.classicfootballshirts.co.uk/2020-21-barcelona-home-shirt-810-lboys-barsh2054542.html",
      "https://www.footballfinery.co.uk/products/1991-92-liverpool-away-football-shirt-l-adidas-ff305115",
      "https://www.thekitman.co.uk/product/2005-06-chelsea-umbro-centenary-home-shirt-medium-mens/",
      "https://www.ebay.co.uk/itm/800009080846",
      "not a url",
      null,
    ]) {
      expect(namesetFromUrl(url), String(url)).toBeNull();
    }
  });
});
