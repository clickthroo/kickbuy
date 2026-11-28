import { describe, expect, it } from "vitest";
import { sale } from "./fixtures";
import { matchShirts, type Shirt, toShirt } from "./match";

const shirt = (o: Partial<Shirt> = {}): Shirt => ({
  productId: null,
  teamKey: "name:juventus",
  season: "2018-19",
  shirtType: "away",
  condition: "Very Good",
  size: { key: "M", band: "adult" },
  manufacturer: "adidas",
  gender: "mens",
  issue: "standard retail version",
  sleeves: "short-sleeved",
  signed: "not signed",
  specialEdition: "not a special edition",
  boxedEdition: "not a boxed edition",
  player: "ronaldo",
  number: "7",
  sourceUrl: null,
  ...o,
});
const opts = { requireExactSize: false };

describe("matchShirts: names and numbers", () => {
  it("allows a missing number when the player names agree, at low confidence", () => {
    const r = matchShirts(shirt({ number: null }), shirt(), opts);
    expect(r).toMatchObject({ ok: true, confidence: "low", notes: ["number missing on the listing"] });
    expect(matchShirts(shirt(), shirt({ number: null }), opts)).toMatchObject({
      ok: true,
      notes: ["number missing on the sale"],
    });
  });

  it("still rejects different numbers, different names, and a number with no name", () => {
    expect(matchShirts(shirt({ number: "9" }), shirt(), opts)).toEqual({ ok: false, reason: "different number" });
    expect(matchShirts(shirt({ player: "dybala", number: null }), shirt(), opts)).toEqual({
      ok: false,
      reason: "different player / name set",
    });
    expect(matchShirts(shirt({ player: null, number: null }), shirt({ player: null }), opts)).toEqual({
      ok: false,
      reason: "different number",
    });
  });
});

describe("matchShirts: condition", () => {
  it("accepts a sale in the same or a worse condition, never a better one", () => {
    expect(matchShirts(shirt(), shirt(), opts)).toMatchObject({ ok: true, sameCondition: true, confidence: "medium" });
    expect(matchShirts(shirt(), shirt({ condition: "Good" }), opts)).toMatchObject({ ok: true, sameCondition: false, confidence: "medium" });
    expect(matchShirts(shirt(), shirt({ condition: "Mint" }), opts)).toEqual({ ok: false, reason: "sold in better condition" });
    expect(matchShirts(shirt(), shirt({ condition: null }), opts)).toEqual({ ok: false, reason: "condition unknown" });
  });
});

describe("matchShirts: name sets", () => {
  it("matches names by surname", () => {
    expect(matchShirts(shirt({ player: "gerrard" }), shirt({ player: "gerrard" }), opts)).toMatchObject({ ok: true });
  });

  it("never matches a plain shirt with a named one, even on the same Kickio product", () => {
    const plain = shirt({ productId: "p1", player: null, number: null });
    const named = shirt({ productId: "p1", player: "gerrard", number: "8" });
    expect(matchShirts(plain, named, opts)).toEqual({ ok: false, reason: "different player / name set" });
  });
});

describe("toShirt", () => {
  const base = sale({ player_name: null, shirt_number: null });
  it("takes a name set from the shop URL when Kickio has none", () => {
    const s = toShirt({ ...base, sale_url: "https://thesoccerarchive.com/products/liverpool-2008-09-third-shirt-gerrard-8-8-11" }, () => null);
    expect(s).toMatchObject({ player: "gerrard", number: "8" });
  });
  it("prefers Kickio's name, reduced to the surname", () => {
    const s = toShirt({ ...sale({ player_name: "Steven Gerrard", shirt_number: "8" }), sale_url: "https://x.example/products/home-shirt-alonso-14" }, () => null);
    expect(s).toMatchObject({ player: "gerrard", number: "8" });
  });
});
