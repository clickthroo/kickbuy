import { describe, expect, it } from "vitest";
import { displayImageUrl } from "./images";

describe("displayImageUrl", () => {
  it("loads Kickio's own images directly", () => {
    const url = "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/product-images/a.jpg";
    expect(displayImageUrl(url)).toBe(url);
  });
  it("sends third-party images through the KickBuy proxy", () => {
    const url = "https://cdn.shopify.com/s/files/shirt.jpg?v=1";
    expect(displayImageUrl(url)).toBe(`/api/img?u=${encodeURIComponent(url)}`);
  });
  it("drops anything that isn't an http(s) URL", () => {
    expect(displayImageUrl("javascript:alert(1)")).toBeNull();
    expect(displayImageUrl("not a url")).toBeNull();
    expect(displayImageUrl(null)).toBeNull();
  });
});
