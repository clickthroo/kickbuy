import { describe, expect, it } from "vitest";
import { canonicalCondition, normaliseManufacturer, normaliseNumber, normalisePlayer, normaliseSeason, normaliseSize } from "./normalise";

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
