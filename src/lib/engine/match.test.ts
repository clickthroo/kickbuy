import { describe, expect, it } from "vitest";
import { matchShirts, type Shirt } from "./match";

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
